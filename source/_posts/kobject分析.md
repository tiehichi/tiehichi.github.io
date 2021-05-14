---
title: kobject分析
date: 2020-03-09
categories:
- kernel research
---


根据文章[The zen of kobjects](https://lwn.net/Articles/51437/)所述，kobject设计之初是为了管理内核对象的引用计数，但在内核的发展过程中，添加了更多的功能；对于较新版本的内核，我理解的kobject的功能主要是：

- 管理内核对象引用计数
- 为内核中的对象创建层级
- 在sysfs中为对象创建文件夹

每一个kobject在文件系统/sys路径下都有对应的文件夹；既然可以以目录的形式表示kobject，那么kobject一定是按照树形结构来划分层级的。

## kobject结构

先看部分精简后的kobject的数据结构

```c
struct kobject {
    const char        *name;  /* 在sysfs中创建文件夹时，文件夹的名称 */
    struct list_head    entry;  /* 链表结构，可以将kobject组织成链表 */
    struct kobject        *parent;  /* 指向父kobject的指针 */
    struct kset        *kset;
    struct kobj_type    *ktype;
    struct kernfs_node    *sd; /* sysfs directory entry */
    struct kref        kref;  /* 该kobject实例的引用 */

      /* 位域，表示该对象的各种状态 */
    unsigned int state_initialized:1;
    unsigned int state_in_sysfs:1;
    unsigned int state_add_uevent_sent:1;
    unsigned int state_remove_uevent_sent:1;
    unsigned int uevent_suppress:1;
};
```

其中kset和ktype是比较重要的两个内容：

- kset是一个kobject组，其本身也是一个kobject
- ktype表示当前kobject的类型，实际上作用是表示当对象引用计数为0时，如何释放对象

## 初始化kobject

kobject的初始化函数是kobject_init()，而kobject_init()中又调用了kobject_init_internal()函数，两个函数的实现都非常简单，精简掉错误处理部分后代码如下：

```c
static void kobject_init_internal(struct kobject *kobj)
{
    if (!kobj)
        return;
    kref_init(&kobj->kref);
    INIT_LIST_HEAD(&kobj->entry);
    kobj->state_in_sysfs = 0;  /* 此时还未在sysfs中创建文件夹 */
    kobj->state_add_uevent_sent = 0;
    kobj->state_remove_uevent_sent = 0;
    kobj->state_initialized = 1;
}
 
void kobject_init(struct kobject *kobj, struct kobj_type *ktype)
{
    kobject_init_internal(kobj);
    kobj->ktype = ktype;
    return;
}
```

实际上初始化操作就只为kobject结构中ktype及各个字段进行赋值，并且对kref字段使用kref_init()初始化引用计数，继续跟一下kref的结构和kref_init()的实现。

```c
struct kref {
	refcount_t refcount;
};
 
static inline void kref_init(struct kref *kref)
{
	refcount_set(&kref->refcount, 1);
}
```

kref_init()将引用初始化为1，所以kobject初始化之后，其引用计数为1。

需要注意kobject_init()函数并未对kobject指针分配内存，所以调用kobject_init()之前，需要手动为其分配内存；但是也有另一个函数，包含了分配内存和初始化的操作：

```c
struct kobject *kobject_create(void)
{
    struct kobject *kobj;

    kobj = kzalloc(sizeof(*kobj), GFP_KERNEL);
    if (!kobj)
    	return NULL;

    kobject_init(kobj, &dynamic_kobj_ktype);
    return kobj;
}
```

kobject_create()函数将kobject的ktype设置为了dynamic_kobject_ktype，这是一个全局的kobj_type，声明如下：

```c
static struct kobj_type dynamic_kobj_ktype = {
    .release    = dynamic_kobj_release,
    .sysfs_ops    = &kobj_sysfs_ops,
};
```

前面提到ktype的作用就是指示当kobject的引用归零时，如何处理kobject；而这里的kobj_type->release就是对应的处理函数，这个dynamic_kobj_release实现如下：

 ```c
static void dynamic_kobj_release(struct kobject *kobj)
{
	pr_debug("kobject: (%p): %s\n", kobj, __func__);
	kfree(kobj);
}
 ```

由于是使用kobject_create()默认设置的ktype，所以release时也只进行了kfree操作。

## 增减引用计数

kobject对象的引用存储在其kref字段中，使用kobject_get()和kobject_put()函数可以增加和减少kobject引用计数。

### 增加引用

kobject_get()实现比较简单：

```c
struct kobject *kobject_get(struct kobject *kobj)
{
    if (kobj) {
        if (!kobj->state_initialized)
            WARN(1, KERN_WARNING
            "kobject: '%s' (%p): is not initialized, yet kobject_get() is being called.\n", kobject_name(kobj), kobj);
		kref_get(&kobj->kref);
    }
    return kobj;
}
```

检查kobject是否为空，然后调用了kref_get()：

```c
static inline void kref_get(struct kref *kref)
{
	refcount_inc(&kref->refcount);
}
```

根据函数名可以确认这就是将kref->refcount记录的引用计数加1。

### 减少引用

减少引用除了要减少kref->refcount，还需要每次检查其值是否为0，如果引用被减少到0，则应该调`ktype->release`

```c
void kobject_put(struct kobject *kobj)
{
    if (kobj) {
        if (!kobj->state_initialized)
            WARN(1, KERN_WARNING
            "kobject: '%s' (%p): is not initialized, yet kobject_put() is being called.\n",
               kobject_name(kobj), kobj);
        kref_put(&kobj->kref, kobject_release);
    }
}

static inline int kref_put(struct kref *kref, void (*release)(struct kref *kref))
{
    if (refcount_dec_and_test(&kref->refcount)) {
    	release(kref);
        return 1;
    }
    return 0;
}
```

kobject_put()在调用kref_put()的时候，将kobject_release()传递给了kref_put()，当引用减少为0时，会调用此函数；改函数精简后源码如下：

```c
static void kobject_release(struct kref *kref)
{
	struct kobject *kobj = container_of(kref, struct kobject, kref);
#ifdef CONFIG_DEBUG_KOBJECT_RELEASE
	……
#else
	kobject_cleanup(kobj);
#endif
}
```

这里通过kref获取到对应的kobject，然后调用kobject_cleanup():

```c
static void kobject_cleanup(struct kobject *kobj)
{
	struct kobj_type *t = get_ktype(kobj);
	……
	if (t && t->release) {
		pr_debug("kobject: '%s' (%p): calling ktype release\n",
 		kobject_name(kobj), kobj);
		t->release(kobj);
	}
	……
}
```

在kobject_cleanup()中，调用了ktype->release，对资源进行了释放。

## kset结构

kset本身也是一个kobject，其结构比较简单：

```c
struct kset {
    struct list_head list;
    spinlock_t list_lock;
    struct kobject kobj;
    const struct kset_uevent_ops *uevent_ops;
}
```

前面说到kset表示一个kobject组，从结构来看，kset也包含kobject结构，所以kset在sysfs中也有对应的文件夹；除了kset_uevent_ops以外，kset结构本身没有其他可以存储数据的部分，所以我认为kset的作用就是为其组内的kobject提供统一的uevent事件。

## kset组织kobject

kobject结构本身包含一个指向kset的指针，但是kset却没有指向子kobject的指针，所以如果需要通过kset找到组内的kobject，只能通过kset->list遍历。

先来看一下kobject_add_internal()的部分：

```c
static int kobject_add_internal(struct kobject *kobj)
{
    ……
    /* join kset if set, use it as parent if we do not already have one */
    if (kobj->kset) {
        if (!parent)  /* 如果未设置parent，会把kset作为该kobject的parent */
        	parent = kobject_get(&kobj->kset->kobj);  /* 增加parent的引用计数 */
        kobj_kset_join(kobj);
        kobj->parent = parent;
    }
    ……
}
```

该函数由kobject_add()调用，除了设置kobject的parent之外，还调用了kobject_kset_join()：

```c
/* add the kobject to its kset's list */
static void kobj_kset_join(struct kobject *kobj)
{
    if (!kobj->kset)
    	return;

    kset_get(kobj->kset);
    spin_lock(&kobj->kset->list_lock);
    list_add_tail(&kobj->entry, &kobj->kset->list);
    spin_unlock(&kobj->kset->list_lock);
}
```

该函数将kobject添加到了kset指针域的尾部，这样就可以通过kset找到组内的所有kobject，kset与组内的kobject组成了下图所示的结构：

![](https://cdn.nlark.com/yuque/0/2021/png/1679957/1619073283151-8ae6f326-5004-4b30-ba99-1f9215174d29.png)

这里需要注意kobject_init()和kobject_add()都没有设置kobject->kset的值，需要手动设置kobject所属的kset。
