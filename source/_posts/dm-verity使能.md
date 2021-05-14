---
title: dm-verity使能
date: 2021-05-14
categories:
- kernel research
---


根据[内核文档](https://www.kernel.org/doc/html/latest/admin-guide/device-mapper/verity.html#example)，用户空间可以通过 `veritysetup` 命令创建块设备的哈希树，创建 `mapped device` 并启用 `dm-verity` 功能，我们来从内核的角度分析一下该命令如何创建激活 `mapped device` 并启用 `dm-verity` 功能。

## device mapper驱动结构

![image.jpeg](https://cdn.nlark.com/yuque/0/2021/jpeg/1679957/1620971139058-94938b70-2252-41dc-9919-0b2baf482e48.jpeg#height=576&id=LbJNA&name=image.jpeg&originHeight=631&originWidth=593&originalType=binary&size=54650&status=done&style=none&width=541)

上图展示了 `device mapper` 的结构，即一个 `mapped device` 拥有一个 `mapping table` ，这个表负责维护 `mapped device` 与 `target device` 之间的映射关系，这些 `target` 既可以是物理设备，也可以是另一个 `mapped device` 。
内核使用下图中的几个结构体来描述这种映射关系：

![image.jpeg](https://cdn.nlark.com/yuque/0/2021/jpeg/1679957/1620972275115-b1afc057-14ec-4c70-9edf-1ba76861b428.jpeg#height=683&id=pgOrG&name=image.jpeg&originHeight=683&originWidth=721&originalType=binary&size=156516&status=done&style=none&width=721)

`mapped_device` 描述设备， `dm_table` 记录 `md` 设备下面有多少个 `target` ， `dm_target` 与 `target_type` 共同描述了 `target` 的驱动， `targe_type` 则是存放操作 `target` 设备的方法。我们的 `dm-verity` 功能，就是其中一种 `target_type` 。

## dm-verity模块初始化

内核中的 `dm-verity` 功能实现在内核源码树 `drivers/md/dm-verity-target.c` 中。
前面说到 `dm-verity` 功能是作为 `target_type` 来实现的，内核中的 `target_type` 使用链表进行管理，使用时通过 `target_type.name` 进行索引； `dm-verity` 模块初始化的过程就是将其对应的 `target_type` 结构体注册到链表上：

```c
/*
 * file: drivers/md/dm-verity-target.c
 */

static struct target_type verity_target = {
    .name       = "verity",
    .version    = {1, 4, 0},
    .module     = THIS_MODULE,
    ...
};

static int __init dm_verity_init(void)
{
    ...
    r = dm_register_target(&verity_target);
    ...
}
```

```c
/*
 * file: drivers/md/dm-target.c
 */

static LIST_HEAD(_targets);

int dm_register_target(struct target_type *tt)
{
    ...
    if (__find_target_type(tt->name))
        rv = -EEXIST;
    else
        list_add(&tt->list, &_targets);
    ...
}
```

## veritysetup的参数

`veritysetup` 激活 `dm-verity` 功能需要提供：

- `mapped device` 设备名
- 数据来源设备节点
- 哈希树设备节点
- 根哈希

```bash
veritysetup create <device name> <data device> <hashtree device> <root hash>
```

这条命令其实包括了两个过程，创建 `mapped device` 设备和处理 `mapped device` 与 `data device` `hashtree device` 之间的关系。这两个过程均为使用 `ioctl` 向 `/dev/mapper/control` 发送命令来实现的。

## device mapper控制节点

`/dev/mapper/control` 在内核中的描述如下：

```c
/*
 * file: drivers/md/dm-ioctl.c
 */

static const struct file_operations _ctl_fops = {
    .open = nonseekable_open,
    .unlocked_ioctl  = dm_ctl_ioctl,
    .compat_ioctl = dm_compat_ctl_ioctl,
    .owner   = THIS_MODULE,
    .llseek  = noop_llseek,
};

static struct miscdevice _dm_misc = {
    .minor      = MAPPER_CTRL_MINOR,
    .name       = DM_NAME,
    .nodename   = DM_DIR "/" DM_CONTROL_NODE,
    .fops       = &_ctl_fops
};
```

通过 `ioctl` 对其进行访问，内核中的函数调用路径为： `dm_ctl_ioctl -> ctl_ioctl -> lookup_ioctl` 。 `lookup_ioctl` 再根据用户发送的命令，来返回不同的函数指针：

```c
static ioctl_fn lookup_ioctl(unsigned int cmd, int *ioctl_flags)
{
    static struct {
        int cmd;
        int flags;
        ioctl_fn fn;
    } _ioctls[] = {
        {DM_VERSION_CMD, 0, NULL}, /* version is dealt with elsewhere */
        ...
        {DM_DEV_CREATE_CMD, IOCTL_FLAGS_NO_PARAMS, dev_create},
        ...
        {DM_TABLE_LOAD_CMD, 0, table_load},
        ...
    };

    if (unlikely(cmd >= ARRAY_SIZE(_ioctls)))
        return NULL;

    *ioctl_flags = _ioctls[cmd].flags;
    return _ioctls[cmd].fn;
}
```

`veritysetup` 使能 `dm-verity` 的核心，是通过 `ioctl` 发送这两个命令： `DM_DEV_CREATE_CMD` 和 `DM_TABLE_LOAD_CMD` 。 `DM_DEV_CREATE_CMD` 就是创建 `mapped-device` ，我们把重点放在 `DM_TABLE_LOAD_CMD` 上。

## DM_TABLE_LOAD_CMD

我们顺着 `DM_TABLE_LOAD_CMD` 命令对应的函数 `table_load` 往下看：

```c
static int table_load(struct dm_ioctl *param, size_t param_size)
{
    ...
    md = find_device(param);
    ...
    r = dm_table_create(&t, get_mode(param), param->target_count, md);
    ...
    r = populate_table(t, param, param_size);
    ...
}
```

函数的实现比较长，我们只关注上面这三行：首先根据参数，找到对应的 `md` 设备，然后创建 `dm_table` 并将其与 `md` 设备关联，然后将参数继续传递给 `populate_table` 函数进行处理。

```c
static int populate_table(struct dm_table *table,
                struct dm_ioctl *param, size_t param_size)
{
    ...
    for (i = 0; i < param->target_count; i++) {
        r = next_target(spec, next, end, &spec, &target_params);
        ...
        r = dm_table_add_target(table, spec->target_type,
                    (sector_t) spec->sector_start,
                    (sector_t) spec->length,
                    target_params);
        ...
        next = spec->next;
    }
    ...
}
```

该函数根据 `param` 参数中的 `target_count` ，通过 `dm_table_add_target` 函数向 `dm_table` 添加 `target` ；此处我们要添加的 `target` 就是 `dm-verity-target` 。
继续看 `dm_table_add_target` 的实现：

```c
int dm_table_add_target(struct dm_table *t, const char *type,
            sector_t start, sector_t len, char *params)
{
    ...
    ->type = dm_get_target_type(type);
    ...
    r = tgt->type->ctr(tgt, argc, argv);
    ...
}
```

`dm_get_target_type` 通过 `type` 来找到对应的 `target_type` 结构体，此处的 `type` 实际上就是 `target_type.name` ，我们要找到 `verity_target` ，所以此处传入的 `type` 为 `"verity"`。
找到 `target_type` 后，调用对应的 `ctr` 函数；对应到 `dm-verity` 中就是函数 `verity_ctr`：

```c
int verity_ctr(struct dm_target *ti, unsigned argc, char **argv)
{
    ...
    r = dm_get_device(ti, argv[1], FMODE_READ, &v->data_dev);
    ...
    r = dm_get_device(ti, argv[2], FMODE_READ, &v->hash_dev);
    ...
}
```

`verity_ctr` 才是真正的对 `dm-verity` 功能进行初始化，包括设置 `data device` ， `hash device` 等信息，创建 `dm_verity` 结构体实例；这些操作完成之后，针对前面创建的 `md` 设备的 `dm-verity` 功能已经使能，之后对其进行的读写操作，会调用到 `verity_target` 的 `map` 函数—— `verity_map` ，该函数负责处理IO之前的映射关系，设置 `bio_end_io` 函数指针，即 `block io` 的完成方法：

```c
int verity_map(struct dm_target *ti, struct bio *bio)
{
    ...
    bio->bi_bdev = v->data_dev->bdev;
    bio->bi_iter.bi_sector = verity_map_sector(v, bio->bi_iter.bi_sector);
    ...

    bio->bi_end_io = verity_end_io;
    ...
}
```

`verity_end_io` 则是将校验的过程加入到 `work_queue` 中，这样每次对块设备的访问，都会触发 `dm-verity` 校验机制。
