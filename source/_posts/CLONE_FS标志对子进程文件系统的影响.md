---
title: CLONE_FS标志对子进程文件系统的影响
date: 2020-06-18
categories:
- kernel research
---


## 争论

这两天在研究沙盒的时候,跟同事争论了一下如下场景: 使用clone加上CLONE_FS创建子进程,父进程使用chroot,是否会同时对子进程的文件系统产生影响. 根据man手册对于CLONE_FS的描述,使用CLONE_FS创建子进程,子进程或者父进程任意一个调用chroot, chdir或者umask, 都会对另一进程产生影响. 具体怎么影响需要看一下内核的源码.

## 系统调用在内核中的实现

Linux的系统调用在定义在`include/linux/syscalls.h`中，例如`clone`系统调用，在`syscalls.h`中的定义为

``` C
#ifdef CONFIG_CLONE_BACKWARDS
asmlinkage long sys_clone(unsigned long, unsigned long, int __user *, unsigned long,
            int __user *);
#else
#ifdef CONFIG_CLONE_BACKWARDS3
asmlinkage long sys_clone(unsigned long, unsigned long, int, int __user *,
            int __user *, unsigned long);
#else
asmlinkage long sys_clone(unsigned long, unsigned long, int __user *,
            int __user *, unsigned long);
#endif
#endif
```

内核中系统调用的实现，一般会使用`SYSCALL_DEFINEn`宏进行封装，其中的n为系统调用的参数个数；使用该宏时，第一个参数为系统调用的名字，仍以`clone`为例，对应的`SYSCALL_DEFINEn`宏的实现为：

``` C
#ifdef __ARCH_WANT_SYS_CLONE
#ifdef CONFIG_CLONE_BACKWARDS
SYSCALL_DEFINE5(clone, unsigned long, clone_flags, unsigned long, newsp,
         int __user *, parent_tidptr,
         unsigned long, tls,
         int __user *, child_tidptr)
#elif defined(CONFIG_CLONE_BACKWARDS2)
SYSCALL_DEFINE5(clone, unsigned long, newsp, unsigned long, clone_flags,
         int __user *, parent_tidptr,
         int __user *, child_tidptr,
         unsigned long, tls)
#elif defined(CONFIG_CLONE_BACKWARDS3)
SYSCALL_DEFINE6(clone, unsigned long, clone_flags, unsigned long, newsp,
         int, stack_size,
         int __user *, parent_tidptr,
         int __user *, child_tidptr,
         unsigned long, tls)
#else
SYSCALL_DEFINE5(clone, unsigned long, clone_flags, unsigned long, newsp,
         int __user *, parent_tidptr,
         int __user *, child_tidptr,
         unsigned long, tls)
#endif
{
    return _do_fork(clone_flags, newsp, 0, parent_tidptr, child_tidptr, tls);
}
#endif
```

## CLONE_FS标志在clone()中的使用

`clone()`系统调用的实现在`kernel/fork.c`中，该文件中还实现了`fork()`和`vfork()`，从该文件中可以确定，`fork`、`vfork`和`clone`在内核中调用的都是`_do_fork()`函数，只是传递的参数不同。

函数`copy_fs()`对`CLONE_FS`标志进行了检查：

``` C
static int copy_fs(unsigned long clone_flags, struct task_struct *tsk)
{
	struct fs_struct *fs = current->fs;
	if (clone_flags & CLONE_FS) {
		/* tsk->fs is already what we want */
		spin_lock(&fs->lock);
		if (fs->in_exec) {
			spin_unlock(&fs->lock);
			return -EAGAIN;
		}
		fs->users++;
		spin_unlock(&fs->lock);
		return 0;
	}
	tsk->fs = copy_fs_struct(fs);
	if (!tsk->fs)
		return -ENOMEM;
	return 0;
}
```

可以看到如果设置了`CLONE_FS`标志，则将当前进程的`fs->users`加1，否则调用`copy_fs_struct()`，并将子进程的`fs`结构指向其返回值：

``` C
struct fs_struct *copy_fs_struct(struct fs_struct *old)
{
	struct fs_struct *fs = kmem_cache_alloc(fs_cachep, GFP_KERNEL);
	/* We don't need to lock fs - think why ;-) */
	if (fs) {
		fs->users = 1;
		fs->in_exec = 0;
		spin_lock_init(&fs->lock);
		seqcount_init(&fs->seq);
		fs->umask = old->umask;

		spin_lock(&old->lock);
		fs->root = old->root;
		path_get(&fs->root);
		fs->pwd = old->pwd;
		path_get(&fs->pwd);
		spin_unlock(&old->lock);
	}
	return fs;
}
```

该函数实现非常简单，就是创建新的`fs_struc`t结构体，并把当前进程`fs`结构中的值，然后返回新的fs结构体。
通过这两个函数，就可以得出结论：

1. 通过`clone`创建子进程，未指定`CLONE_FS`时，子进程拥有自己的`fs`结构，其初始值与父进程的`fs`结构相同；双方通过`chroot`、`chdir`修改`fs`结构时，均不影响另一个进程。

2. 指定`CLONE_FS`时，父子进程结构体中`fs`字段指向同一块内存区域，所以任何一方使用`chroot`、`chdir`等修改`fs`结构时，也会对应一个进程生效。

## 进程的fork

进程的`fork`，关键在于进程结构体的复制，而这个过程是在`dup_task_struct()`中实现的，从`fork`、`vfork`、`clone`开始，调用顺序为：
`clone`/`fork`/`vfork` -> `_do_fork` -> `copy_process` -> `dup_task_struct`

该函数的实现简单来说分为如下步骤：

1. 为新的`task_struct`结构体分配内存
2. 分配栈空间
3. 将当前进程的`task_struct`结构体各个字段赋值给子进程的`task_struct`（使用`*dst = *src`）
4. 将新的栈空间赋值给子进程的`task_struct->stack`。

为什么子进程的`task_struct`结构体被分配了新的内存，却还能在设置了`CLONE_FS`后与父进程共享`task_struct->fs`？
因为`task_struct`中，`fs`的数据类型是`struct fs_struct *`，所以两个`fs`实际上指向同一块内存区域。
