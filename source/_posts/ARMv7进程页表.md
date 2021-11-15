---
title: ARMv7进程页表
date: 2021-11-15
categories:
    - kernel research
---

`Linux`每个进程有独立的页表，函数调用路径：`_do_fork` -> `copy_process` -> `copy_mm` -> `dup_mm` -> `mm_alloc_pgd` -> `pgd_alloc`。`pgd_alloc()`的实现与平台相关，对于arm32平台，其实现位于`arch/arm/mm/pgd.c`中：

```c
/*
 * need to get a 16k page for level 1
 */
pgd_t *pgd_alloc(struct mm_struct *mm)
{
    pgd_t *new_pgd, *init_pgd;
    pud_t *new_pud, *init_pud;
    pmd_t *new_pmd, *init_pmd;
    pte_t *new_pte, *init_pte;

    new_pgd = __pgd_alloc();
    if (!new_pgd)
        goto no_pgd;

    memset(new_pgd, 0, USER_PTRS_PER_PGD * sizeof(pgd_t));

    /*
    * Copy over the kernel and IO PGD entries
     */
    init_pgd = pgd_offset_k(0);
    memcpy(new_pgd + USER_PTRS_PER_PGD, init_pgd + USER_PTRS_PER_PGD,
               (PTRS_PER_PGD - USER_PTRS_PER_PGD) * sizeof(pgd_t));

    clean_dcache_area(new_pgd, PTRS_PER_PGD * sizeof(pgd_t));

......
}
```

进程的全局页表使用`__pgd_alloc`分配，共分配4个页16k大小：

```c
#define __pgd_alloc()	(pgd_t *)__get_free_pages(GFP_KERNEL, 2)
```

然后使用`memset`将分配的内存置0，但是这里置0的内存大小为`USER_PTRS_PER_PGD * sizeof(pgd_t)`，而`USER_PTRS_PER_PGD`为`TASK_SIZE/PGDIR_SIZE`，`TASK_SIZE`我们知道是用户虚拟地址空间大小，所以`USER_PTRS_PER_PGD`实际上是用户虚拟地址空间需要占用多少条pgd项，既`memset`置0的部分刚好用来映射用户虚拟地址空间。

```c
#define USER_PTRS_PER_PGD	(TASK_SIZE / PGDIR_SIZE)
```

接下来的`pgd_offset_k(0)`是从`init_mm`中获取pgd的地址，实际上就是`swapper_pg_dir`，然后从`swapper_pg_dir`中将内核虚拟地址映射表复制到刚申请的pgd中。

```c
/* to find an entry in a kernel page-table-directory */
#define pgd_offset_k(addr)	pgd_offset(&init_mm, addr)
```

这部分代码可以说明，每个进程有自己的pgd，pgd中包含了用户虚拟地址空间映射和内核虚拟地址空间映射，不同进程的内核虚拟地址空间映射是相同的，在arm32上都是从`swapper_pg_dir`复制过来的。
对比arm64平台的`pgd_alloc`实现：

```c
pgd_t *pgd_alloc(struct mm_struct *mm)
{
    if (PGD_SIZE == PAGE_SIZE)
        return (pgd_t *)__get_free_page(PGALLOC_GFP);
    else
        return kmem_cache_alloc(pgd_cache, PGALLOC_GFP);
}
```

可见arm64中并没有从`swapper_pg_dir`中拷贝内核虚拟地址映射的步骤，这是因为arm64上linux进程用户地址空间和内核地址空间都是256TB，Linux内核会配置使用`TTBR0`和`TTBR1`寄存器，`TTBR0`存放用户pgd的基址，`TTBR1`存放内核pgd的基址，MMU根据传入的虚拟地址来选择使用`TTBR0`还是`TTBR1`寄存器。

arm32平台同样具有`TTBR0`和`TTBR1`两个全局页表基址寄存器，但Linux内核并没有使用`TTBR1`，这是因为arm32对用户虚拟地址空间与内核虚拟地址空间的分割无法满足Linux内核的需求。

ARMv7虚拟地址映射支持长描述符和短描述符两种形式，Linux内核使用短描述符形式，两级页表：

![image.png](https://cdn.nlark.com/yuque/0/2021/png/1679957/1636945934322-7288573e-8f01-4b42-833c-039211d6e225.png#clientId=u0ab16135-8a44-4&from=paste&id=u5ac204a8&margin=%5Bobject%20Object%5D&name=image.png&originHeight=505&originWidth=970&originalType=url&ratio=1&size=68107&status=done&style=none&taskId=udbdaa2a9-1d19-42fc-a12c-ab82321af7f)

`TTBR`为一级页表基地址寄存器，ARMv7有`TTBR0`和`TTBR1`两个页表基址寄存器，可以满足全局页表切换的需要；但是Linux内核虚拟地址空间分配为用户空间3G，内核空间1G，内核虚拟起始地址为`0xC0000000`；根据ARM手册的描述，`TTBR0`和`TTBR1`的切换规则为：`TTBCR`寄存器值为N，取值范围0-7，如果N为0，则使用`TTBR0`；如果N>0，虚拟地址第`[31:32-N]`位均为0，则使用`TTBR0`，否则使用`TTBR1`。满足使用`TTBR1`的最小N值为1，这时`TTBR1`的虚拟地址范围为`0x80000000-0xFFFFFFFF`，因此Linux内核不使用`TTBR1`寄存器。

在不使用`TTRB1`的情况下，有两种方式可以满足Linux平台的需求，既每个进程有独立的用户虚拟地址映射和相同的内核虚拟地址映射：一是进程进入内核态时，修改`TTBR0`来切换页表；另一种方法是创建进程时将内核虚拟地址映射复制到进程的全局页表中。根据前面的分析，Linux内核选择了第二种方式，这是基于性能考虑，通过修改`TTBR0`来切换页表，每次陷入内核态都需要进行页表地址的切换，非常影响性能；而复制页表项的方式仅需在进程创建时完成，不影响进程运行过程中的性能。
