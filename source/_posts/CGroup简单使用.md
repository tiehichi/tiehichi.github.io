---
title: cgroup的简单使用
date: 2019-12-18
---
# `cgroup`的简单使用

`cgroup（control group）`是由`linux`内核提供的功能，可以对一组进程使用的资源进行监控、管理和限制。

## 工作机制

`cgroup`的工作机制有四部分组成：任务（`task`），控制组（`cgroup`），子系统（`subsystem`）和层级（`hierarchy`）。

- 任务（`task`）

  `cgroup`中的任务实际上就是指系统中的进程。

- 控制组（`cgroup`）

  控制组是层级（`hierarchy`）树中的某一个节点，其中包含了一组任务和某个`subsystem`的相关控制项。

- 子系统（`subsystem`）

  一个子系统实际上就是一个提供了对某种资源控制功能的内核模块。`cgroup`支持多种`subsystem`，每一种`subsystem`可以针对某一种资源进行控制管理，如`memory`、`block IO`等等。

- 层级（`hierarchy`）

  `hierarchy`是以目录树的形式组织起来的`control groups`，一个层级可以与0个或者多个`subsystem`关联，关联后即可对`hierarchy`中某一层级的`cgroup`通过`subsystem`进行资源控制。

![cgroup.png](https://i.loli.net/2019/12/18/5aIrkzDoOd3BLiT.png)

如上图所示，`cgroup`中各个组成部分之间的关系：

- 一个子系统最多只能被添加到一个层级中
- 一个层级可以关联多个子系统，也可以不关联子系统
- 一个任务可以被添加到多个控制组中，但控制组所属的层级必须不同，即任务在层级中只能属于一个`cgroup`
- 系统中进程创建子进程时，子进程会被自动添加到父进程所在的`cgroup`中。
- 创建新的`hierarchy`时，会将当前系统中所有进程添加到其`root cgroup`中。

## 内核编译选项

前面提到`subsystem`是内核模块，开启这些内核模块需要在编译内核时打开对应的选项

| 子系统       | 内核选项                    | 依赖项                              | 内核版本 |
| :----------- | --------------------------- | ----------------------------------- | -------- |
| `cpu`        | `CONFIG_CGROUP_SCHED`       |                                     | `2.6.24` |
| `cpuacct`    | `CONFIG_CGROUP_CPUACCT`     |                                     | `2.6.24` |
| `cpuset`     | `CONFIG_CPUSETS`            |                                     | `2.6.24` |
| `memory`     | `CONFIG_MEMCG`              | `RESOURCE_COUNTERS`                 | `2.6.25` |
| `devices`    | `CONFIG_CGROUP_DEVICE`      |                                     | `2.6.26` |
| `freezer`    | `CONFIG_CGROUP_FREEZER`     |                                     | `2.6.28` |
| `net_cls`    | `CONFIG_CGROUP_NET_CLASSID` |                                     | `2.6.29` |
| `blkio`      | `CONFIG_BLK_CGROUP`         |                                     | `2.6.33` |
| `perf_event` | `CONFIG_CGROUP_PERF`        |                                     | `2.6.39` |
| `net_prio`   | `CONFIG_CGROUP_NET_PRIO`    |                                     | `3.3`    |
| `hugetlb`    | `CONFIG_CGROUP_HUGETLB`     | `RESOURCE_COUNTERS`和`HUGETLB_PAGE` | `3.5`    |
| `pids`       | `CONFIG_CGROUP_PIDS`        |                                     | `4.3`    |
| `rdma`       | `CONFIG_CGROUP_RDMA`        |                                     | `4.11`   |

## 使用

### 查看子系统与层级关联情况

使用`cat /proc/cgroups`可以查看当前系统中可用的`cgroup`子系统与层级之间的关系；以`Ubuntu 18.04`为例：

``` bash
~$ cat /proc/cgroups 
#subsys_name	hierarchy	num_cgroups	enabled
cpuset			6			3			1
cpu				3			92			1
cpuacct			3			92			1
blkio			7			92			1
memory			4			207			1
devices			5			92			1
freezer			2			3			1
net_cls			9			3			1
perf_event		11			3			1
net_prio		9			3			1
hugetlb			10			3			1
pids			8			97			1
rdma			12			1			1
```

结果从左到右依次为：子系统名，与子系统关联的层级ID，该层级中`cgroup`的数量，子系统是否启用。

当系统中没有挂载任何层级时，结果如下

``` bash
~$ cat /proc/cgroups
#subsys_name    hierarchy   num_cgroups enabled
cpuset  		0			1       	1
cpu     		0       	1       	1
cpuacct 		0       	1       	1
blkio   		0       	1       	1
memory  		0       	1       	1
devices 		0       	1       	1
freezer 		0       	1       	1
net_cls 		0       	1       	1
perf_event      0       	1       	1
net_prio        0       	1       	1
```

### 创建新的层级

使用`mount -t cgroup`可以看到系统中当前挂载的层级

``` bash
~$ mount -t cgroup
cgroup on /sys/fs/cgroup/systemd type cgroup (rw,nosuid,nodev,noexec,relatime,xattr,name=systemd)
cgroup on /sys/fs/cgroup/freezer type cgroup (rw,nosuid,nodev,noexec,relatime,freezer)
cgroup on /sys/fs/cgroup/cpu,cpuacct type cgroup (rw,nosuid,nodev,noexec,relatime,cpu,cpuacct)
cgroup on /sys/fs/cgroup/memory type cgroup (rw,nosuid,nodev,noexec,relatime,memory)
cgroup on /sys/fs/cgroup/devices type cgroup (rw,nosuid,nodev,noexec,relatime,devices)
cgroup on /sys/fs/cgroup/cpuset type cgroup (rw,nosuid,nodev,noexec,relatime,cpuset)
cgroup on /sys/fs/cgroup/blkio type cgroup (rw,nosuid,nodev,noexec,relatime,blkio)
cgroup on /sys/fs/cgroup/pids type cgroup (rw,nosuid,nodev,noexec,relatime,pids)
cgroup on /sys/fs/cgroup/net_cls,net_prio type cgroup (rw,nosuid,nodev,noexec,relatime,net_cls,net_prio)
cgroup on /sys/fs/cgroup/hugetlb type cgroup (rw,nosuid,nodev,noexec,relatime,hugetlb)
cgroup on /sys/fs/cgroup/perf_event type cgroup (rw,nosuid,nodev,noexec,relatime,perf_event)
cgroup on /sys/fs/cgroup/rdma type cgroup (rw,nosuid,nodev,noexec,relatime,rdma)
```

在创建新的层级关联子系统之前，需要先确定`subsystem`是否已经关联其他层级，如果有，需要先卸载该层级。如上图结果中，如果需要卸载`freezer`子系统关联的层级，可以使用`umount /sys/fs/cgroup/freezer`卸载。

创建`cgroup`层级直接在挂载`cgroup`文件系统即可，一般挂载在`/sys/fs/cgroup/`下，挂载在其他路径也可以。

``` bash
mkdir -p /run/cgroup/memory
mount -t cgroup -o memory <name> /run/cgroup/memory		# 创建一个与memory子系统关联的层级，<name>可以替换为任意字符串

mkdir -p /run/cgroup/cpu,cpuacct
mount -t cgroup -o cpu,cpuacct <name> /run/cgroup/cpu,cpuacct	# 创建一个与cpu和cpuacct子系统关联的层级

mkdir -p /run/cgroup/test
mount -t cgroup -o none,name=<name> <another name> /run/cgroup/test			# 创建一个不与任何子系统关联的层级,此处的name=<name>作为参数,是该层级的标识符
```

当层级不与任何子系统关联，挂载时指定的参数`name=<name>`，`<name>`为该层级的唯一标记；当挂载另一个不关联子系统的层级时，如果参数`name=<name>`指定的`<name>`已经存在，则会再次挂载该层级，两个挂载点的内容相同。

``` bash
~$ mkdir -p /run/cgroup/nametest
~$ mount -t cgroup -o none,name=nametest cgroup /run/cgroup/nametest
~$ cd /run/cgroup/nametest && mkdir test_flag && ls
cgroup.clone_children  cgroup.procs           cgroup.sane_behavior   notify_on_release      release_agent          tasks                  test_flag

~$ mkdir -p /run/cgroup/nametest2
~$ mount -t cgroup -o none,name=nametest cgroup /run/cgroup/nametest2
~$ cd /run/cgroup/nametest2 && ls
cgroup.clone_children  cgroup.procs           cgroup.sane_behavior   notify_on_release      release_agent          tasks                  test_flag
# test_flag仍然存在，说明仅再次挂载了name=nametest的层级，没有创建新的层级
```

### 查看进程属于哪些`cgroup`

使用`cat /proc/<进程号>/cgroup`查看进程属于哪些`cgroup`，例如

``` bash
~$ cat /proc/1/cgroup
12:rdma:/
11:perf_event:/
10:hugetlb:/
9:net_cls,net_prio:/
8:pids:/
7:blkio:/
6:cpuset:/
5:devices:/
4:memory:/
3:cpu,cpuacct:/
2:freezer:/
1:name=systemd:/init.scope
0::/init.scope
```

结果从左到右依次为：所属层级的ID，与层级关联的子系统，在层级的目录树中所属的`cgroup`的路径。

