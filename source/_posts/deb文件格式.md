---
title: deb文件格式
date: 2020-01-22
---
# deb文件格式

deb软件包实际上是`archive file`，可以使用`ar`命令进行打包和解包

## 文件格式

以下图片来自[维基百科](https://en.wikipedia.org/wiki/Deb_(file_format))

![Frhed_hex_editor_displaying_deb_package.png](https://i.loli.net/2020/01/22/216GSpUtJ3cwbLZ.png)

![Deb_File_Structure.png](https://i.loli.net/2020/01/22/XW89UdHnClJfoT1.png)

## 解压deb包

``` bash
# 查看deb包含的文件
~ $ ar tv google-chrome-stable_current_amd64.deb 
rw-r--r-- 0/0      4 Jan 16 09:44 2020 debian-binary
rw-r--r-- 0/0  12131 Jan 16 09:44 2020 control.tar.gz
rw-r--r-- 0/0 62181000 Jan 16 09:46 2020 data.tar.xz

# 解压deb包
~ $ ar x google-chrome-stable_current_amd64.deb
```

使用`ar`命令解压后得到三个文件，分别是`debian-binary`, `control`压缩包, `data`压缩包。

- `debian-binary`

  纯文本文件，只有一行内容，记录了当前deb格式的版本号：

  ``` bash
  ~ $ cat debian-binary 
  2.0
  ```

- `control`压缩包

  `control`包使用`tar`打包，支持`gzip`和`xz`压缩方式，其中包含了deb软件包的控制文件

- `data`压缩包

  `data`压缩包中包含了实际要安装的文件，同样使用`tar`打包，支持`gzip`、`bzip2`、`lzma`和`xz`压缩

## `dpkg-deb`命令

`dpkg-deb`命令是`dpkg`工具包中用来操作deb软件包的命令，可以解压、查看和重新打包deb文件。

### 查看deb包信息

``` bash
dpkg-deb -c <deb package>    # 列出deb包中所有待安装文件
dpkg-deb -I <deb package>    # 显示deb包的详细信息
dpkg-deb -f <deb package>    # 显示deb包中control文件的各个字段
dpkg-deb -W <deb package>    # 显示软件包信息和版本
```

### 解压deb软件包

``` bash
dpkg-deb -e <deb package> <directory>    # 解压deb包的控制信息
dpkg-deb -x <deb package> <directory>    # 解压deb包中的待安装文件
```

与使用`ar`命令解压不同，`ar`命令会解压出`control`和`data`两个压缩包，而`dpkg-deb`会继续对压缩包进行解压，输出其中的文件。

### 打包deb软件包

``` bash
dpkg-deb -b <directory> <deb name>    # 构建deb软件包
```

该命令中，待构建文件夹的结构为：

```
<top directory>/
	|---- DEBIAN/
	|		|---- control
	|		|---- md5sums
	|---- <path to install>/
			|---- <file>
```

其中`DEBIAN`文件夹内必须包含`control`文件，其他控制文件及脚本按需添加，文件安装的路径与`top dir`中其他文件的路径一致，即`top dir`作为`fakeroot`。

## `control`压缩包

`control`包中包含以下文件：

- `control`
- `md5sums`
- `conffiles`
- `perins`, `postins`, `prerm`, `postrm`
- `config`
- `shlibs`

### `control`

`control`文件包含了软件包的信息，例如`Chrome`安装包的`control`文件内容如下

```
Package: google-chrome-stable
Version: 79.0.3945.130-1
Architecture: amd64
Maintainer: Chrome Linux Team <chromium-dev@chromium.org>
Installed-Size: 215627
Pre-Depends: dpkg (>= 1.14.0)
Depends: ca-certificates, fonts-liberation, libappindicator3-1, libasound2 (>= 1.0.16), libatk-bridge2.0-0 (>= 2.5.3), libatk1.0-0 (>= 2.2.0), libatspi2.0-0 (>= 2.9.90), libc6 (>= 2.16), libcairo2 (>= 1.6.0), libcups2 (>= 1.4.0), libdbus-1-3 (>= 1.5.12), libexpat1 (>= 2.0.1), libgcc1 (>= 1:3.0), libgdk-pixbuf2.0-0 (>= 2.22.0), libglib2.0-0 (>= 2.31.8), libgtk-3-0 (>= 3.9.10), libnspr4 (>= 2:4.9-2~), libnss3 (>= 2:3.22), libpango-1.0-0 (>= 1.14.0), libpangocairo-1.0-0 (>= 1.14.0), libx11-6 (>= 2:1.4.99.1), libx11-xcb1, libxcb1 (>= 1.6), libxcomposite1 (>= 1:0.3-1), libxcursor1 (>> 1.1.2), libxdamage1 (>= 1:1.1), libxext6, libxfixes3 (>= 1:5.0), libxi6 (>= 2:1.2.99.4), libxrandr2 (>= 2:1.2.99.3), libxrender1, libxss1, libxtst6, wget, xdg-utils (>= 1.0.2)
Recommends: libu2f-udev
Provides: www-browser
Section: web
Priority: optional
Description: The web browser from Google
 Google Chrome is a browser that combines a minimal design with sophisticated technology to make the web faster, safer, and easier.
```

关于control文件中各个字段的意义及格式可以参考[Debian官方文档](https://manpages.debian.org/unstable/dpkg-dev/deb-control.5.en.html)。

### `md5sums`

该文件中记录了软件包中所有待安装文件的MD5校验和，格式如下：

```
1d15dcfb6bb23751f76a2b7b844d3c57  sbin/parted
4eb9cc2e192f1b997cf13ff0b921af74  usr/share/man/man8/parted.8.gz
2f356768104a09092e26a6abb012c95e  usr/share/doc/parted/README.Debian
a6259bd193f8f150c171c88df2158e3e  usr/share/doc/parted/copyright
7f8078127a689d647586420184fc3953  usr/share/doc/parted/changelog.Debian.gz
98f217a3bf8a7407d66fd6ac8c5589b7  usr/share/doc/parted/changelog.gz
```

### `conffiles`

该文件内容表示，软件包的待安装文件中，哪些是配置文件，文件内容格式如：

```
/etc/cups/snmp.conf
/etc/cups/cupsd.conf
```

执行

```
dpkg --status <package>
```

在输出结果中的`conffiles`字段可以看到这些内容，例如`cups`包的输出中包含：

```
Conffiles:
 /etc/cups/snmp.conf 47b8f1c3fecdc44e3d1fdee4b9eeb3f5
```

### `perins`, `postins`, `prerm`, `postrm`

这四个文件是在包安装和删除前后触发执行的脚本，其中`perins`和`postins`分别在安装前后执行，`prerm`和`postrm`在卸载前后执行

### `config`

`config`是一个可选的，支持`debconf`机制的脚本，参考[debconf教程](http://www.fifi.org/doc/debconf-doc/tutorial.html#AEN113)。

### `shlibs`

该文件列出软件包依赖的共享库，参考[Debian官方文档](https://manpages.debian.org/unstable/dpkg-dev/dpkg-shlibdeps.1.en.html#Shlibs_files)。
