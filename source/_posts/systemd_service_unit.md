---
title: Systemd Service 单元文件的编写
date: 2017-09-19
desc: systemd unit service 单元文件
---

目前我所掌握的使一个Linux下的软件开机自启动的方法只有将其加入`rc.local`文件或桌面环境的`autostart`文件中，但前者不能很好的保证软件的依赖关系，后者要求系统具备桌面环境。虽然知道现在大多数发行版已经使用`systemd`来管理系统服务，但一直没有研究过如何编写其单元文件，为了解决上述问题，研究了一下`systemd`的`service`单元文件的写法，将遇到的问题做个总结。
<!--more-->

### `systemctl`

`systemctl`命令基本相当于`System V init`的`service`命令，可用于系统服务的管理，也可以进行电源管理，常用命令如下：

- 系统服务管理

``` bash
systemctl enable <unit>     # 将<unit>设置为开机自启动
systemctl disable <unit>    # 取消<unit>开机自启动

systemctl start <unit>      # 启动<unit>
systemctl restart <unit>    # 重启<unit>
systemctl stop <unit>       # 停止<unit>
systemctl status <unit>     # 查看<unit>的状态
systemctl reload <unit>     # 重新加载<unit>的配置文件而不关闭服务

systemctl is-active <unit>  # 查看<unit>是否为激活状态
systemctl is-enabled <unit> # 查看<unit>是否设置了开机自启
systemctl is-failed <unit>  # 查看<unit>是否加载失败
```

- 电源管理

``` bash
systemctl reboot            # 重启
systemctl poweroff          # 关机
systemclt hibernate         # 休眠
systemctl suspend           # 待机
```

### `systemd`单元文件

`systemd`的单元文件有以下几类：

- 系统服务 `.service`
- 挂载点 `.mount`
- sockets `.socket`
- 系统设备 `.device`
- 交换分区 `.swp`
- 文件路径 `.path`
- 启动目标 `.target`
- 定时器 `.timer`

当使用`systemctl`对一个单元进行操作时，一般需要使用单元的全名，如`ssh.service`，但如果使用不带后缀名的单元名称，`systemctl`将会把这个单元当做系统服务(`.service`)进行操作。如果一个单元文件中存在`@`字符，表示该单元文件是一个模板单元，当使用`systemctl`操作模板单元时，需要对单元进行实例化，否则会调用失败。

单元文件可以从两个地方加载：

- `/usr/lib/systemd/system/`：软件包安装的单元
- `/etc/systemd/system/`：系统管理员安装的单元

加载优先级上，系统管理员安装的单元优先级高于软件包安装的单元。

### Serivce单元文件编写

`service`单元文件有三个段落：`[Unit]` `[Service]` `[Install]`；其单元文件的编写模板可以参考man手册的[EXAMPLE章节](http://jlk.fjfi.cvut.cz/arch/manpages/man/systemd.service.5#EXAMPLES)，上面提到的单元加载目录下也有很多例子可供参考。

__依赖关系的处理__

如果需要`A`单元在`B`单元启动之后启动，仅指定`Requires=B`或`Wants=B`是不行的，如果不指定`After=B`，`A`单元和`B`单元会并行启动。为了保证`A`在`B`单元启动之后再启动，应该在`A`的配置文件中`[Unit]`段中添加`Requires=B`和`After=B`。

在`[Unit]`段中，用于表示依赖关系的选项有`Wants`、`Requires`、`BindsTo`和`PartOf`，他们所表示的依赖关系的强弱可以大致表示为

```
PartOf = BindsTo > Requires > Wants
```

`Wants`的依赖关系最弱，当依赖的单元启动失败时，不会对其他单元的启动造成影响；`Requires`所指定的单元中有一个启动失败时，其他相关的单元都不会被启动；`BindsTo`的依赖性比`Requires`更强，当启动使用了`BindsTo`的单元时，`BindsTo`所指定的单元均会被启动，当列出的单元全部被启动后，该单元也会被启动，但是如果指定的单元中任意一个终止或重启，该单元也会终止或重启；`PartOf`类似于`BindsTo`，不同的是，使用`PartOf`的单元不会随着依赖单元的启动而启动。

__为启动的服务设置环境变量__

可以在单元配置文件的`[Service]`段落中添加`Environment`选项，例如
```
Environment=LANG=zh_CN.UTF_8
```
如果需要添加多个环境变量，~~应在`[Service]`中添加多个`Environment`，而不是在一个`Environment`后面添加多个环境变量的值。~~ 可以在`[Service]`中添加多个`Environment`，也可以在`Environment`后添加多个环境变量的定义，使用空格分隔，如：
```
Environment=PATH=/home/jack CONFIG='-std=c99'
```
对没错也可以使用`'`，可以查看man手册的[相关章节](http://jlk.fjfi.cvut.cz/arch/manpages/man/systemd.service.5.en#COMMAND_LINES)获得更多信息。

也可以使用`EnvironmentFile`选项指定一个包含环境变量列表的文件路径，这个文件中每一行都是一个环境变量的值。例如，单元文件中`[Service]`字段包含选项如下：
```
EnvironmentFile=/home/jack/env
```
`/home/jack/env`文件包含内容格式如下：
```
LANG=zh_CN.UTF-8
CONFIGPATH=/home/jack/.config/config
```

__设置运行服务的用户和组__

在单元配置文件的`[Service]`段落中添加`User`和`Group`选项即可，如

```
User=Jack
Group=Jack
```

__设置服务的工作路径__

在单元配置文件的`[Service]`段落中添加`WorkingDirectory`选项，如

```
WorkingDirectory=/home/Jack/
```

### 总结

经过了激烈的讨论之后绝大多数发行版还是迁移到了`Systemd`，这个东西确实符合UNIX`keep it simple and stupid`的哲学，而是一个大而全的东西。`Systemd`出现后接管了Linux上包括启动日志在内的很多东西，造成使用者们之前掌握的一部分技能在这上面不顶用了，这会不会也是`Systemd`出现后遭到抵制的原因之一呢。

更多`Systemd`的相关资料可以查看man手册的[systemd章节](http://jlk.fjfi.cvut.cz/arch/manpages/man/systemd.1)，以及ArchLinux Wiki页面中关于[Systemd的部分](https://wiki.archlinux.org/index.php/Systemd)。
