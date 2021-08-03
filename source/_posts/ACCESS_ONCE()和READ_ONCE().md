---
title: ACCESS_ONCE()和READ_ONCE()
date: 2021-08-03
categories:
- kernel research
---


内核代码中经常看到使用 `ACCESS_ONCE()` ， `READ_ONCE()` 和 `WRITE_ONCE()` 的地方，本文分析一下这几个宏的作用和实现方式。

## 编译器优化

考虑下面这段代码：

```c
for (;;) {
    struct task_struct *owner;

    owner = ACCESS_ONCE(lock->owner);
    if (owner && !mutex_spin_on_owner(lock, owner))
        break;
    /* ... */
}
```

如果忽略 `ACCESS_ONCE()` 宏，那么编译器可能认为 `owner` 在循环中并没有被修改，因此不需要每次循环都读取 `lock->owner` 并将其赋值给 `owner` ，那么编译器优化之后的代码就可能变成：

```c
struct task_struct *owner;
owner = ACCESS_ONCE(lock->owner);
for (;;) {
    if (owner && !mutex_spin_on_owner(lock, owner))
        break;
    /* ... */
}
```

但是 `lock->owner` 可能会被另外一个线程改变，而这段优化后的代码无法捕获这种改变，会引起代码运行结果异常； `ACCESS_ONCE()` 宏的作用就是阻止编译器的优化。

## ACCESS_ONCE()

`ACCESS_ONCE()` 宏的实现位于 `include/linux/compiler.h` 中：

```c
#define ACCESS_ONCE(x) (*(volatile typeof(x) *)&(x))
```

该宏为变量 `x` 临时添加 `volatile` 关键字来阻止编译器的优化，如重排序、合并访问等。
这里需要思考一个问题，一般在编写用户层代码时，如果一个变量可能在多个线程之间共享，我们会在变量声明的时候为其添加 `volatile` 关键字，为什么内核中要使用这种方式，而不是在声明时就添加 `volatile` 呢？我的理解是声明时添加 `volatile` ，会阻止编译器对该变量的任何优化，这会让代码整体产生一定的性能损耗；而内核为了极致的性能，仅在需要阻止编译器优化时添加 `volatile` ，其余的地方仍然让编译器尽可能的进行优化。

## READ_ONCE()

较新版本的内核中已经很少使用 `ACCESS_ONCE()` 宏，而转为使用 `READ_ONCE()` 。
`READ_ONCE()` 的引入源于一个编译器bug：在GCC 4.6和4.7版本中，对于非标量数据类型，例如结构体，编译器会自动移除变量的 `volatile` 关键字。解决这个问题可以从编译器的角度入手，修复编译器bug，但一来很多系统仍在使用GCC 4.6和4.7，二来这个bug的出现也说明了 `ACCESS_ONCE()` 宏的实现不够健壮。为了解决这个问题，同时保持代码的兼容性，最终内核引入了 `READ_ONCE()` 宏，并保留了 `ACCESS_ONCE()` 的实现。
`READ_ONCE()` 实现如下：

```c
#define __READ_ONCE_SIZE						\
({									\
	switch (size) {							\
	case 1: *(__u8 *)res = *(volatile __u8 *)p; break;		\
	case 2: *(__u16 *)res = *(volatile __u16 *)p; break;		\
	case 4: *(__u32 *)res = *(volatile __u32 *)p; break;		\
	case 8: *(__u64 *)res = *(volatile __u64 *)p; break;		\
	default:							\
		barrier();						\
		__builtin_memcpy((void *)res, (const void *)p, size);	\
		barrier();						\
	}								\
})

static __always_inline
void __read_once_size(const volatile void *p, void *res, int size)
{
	__READ_ONCE_SIZE;
}
```

该宏判断变量的大小，对于1、2、4、8个字节的变量，将其转换为对应的标量类型：u8、u16、u32和u64，并添加 `volatile` 关键字；对于超过8个字节类型，使用 `barrier()` 来阻止优化。
