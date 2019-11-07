---
title: 树莓派上的骚操作
date: 2018-04-04
desc: 树莓派3 raspberrypi
---

树莓派是个好东西，简单易用价格不贵，就是上面的坑还真不少，本文记录一下在使用树莓派2/3的过程中踩过的坑
<!--more-->

### 串口问题
树莓派3上蓝牙使用硬件串口，软件串口`ttyS0`的速率不稳定基本无法正常使用。为了能够使用硬件串口设备`ttyAMA0`即`GPIO 14 15`脚，需要禁用蓝牙设备，关闭串口shell并打开硬件串口。

向`/boot/config.txt`文件中添加`dtoverlay=pi3-disable-bt`将禁用蓝牙设备，具体可见`/boot/overlays`文件夹中的`README`文件。然后使用`raspi-config`关闭串口shell并且打开硬件串口，重启后即可使用`ttyAMA0`串口设备。

### 远程连接
刚装完系统的树莓派，没有显示屏没有串口线，默认没有打开`ssh`和`vnc`服务，怎么远程连接上去呢？直接在SD卡的`boot`分区中创建一个名为`ssh`的空文件，再启动树莓派的时候`ssh`服务就被启动了。

需要注意的是，如果使用这种方法启动了ssh服务，就不要再去`raspi-config`中启动ssh服务了，否则树莓派上回启动两个`ssh`服务，远程连接上去使用任何命令都会被两个`ssh`服务同时执行，也就是任何命令都会被执行两次。

### IP地址
没有路由器密码没有屏幕怎么查看树莓派ip地址呢？这里强烈安利我的小脚本[LAN-Scanner](https://github.com/StarAndRabbit/LAN-Scanner)，简单粗暴显示局域网内的活动IP和MAC和OUI信息。

### 3.5MM音频输出电流声
网上很多人都提过树莓派的音频输出电流声过大的问题，有人说电路设计有问题解决不了，有人说换电流稳定的电源，有人说换USB声卡，居然还有人说大力出奇迹使劲把接头往里按的......其实解决方法很简单，在`/boot/config.txt`中添加`audio_pwm_mode=2`，重启，完事。

### 备份镜像过大
在Linux上使用`dd`把SD卡备份出来的镜像文件，跟SD卡容量大小相等，你用张32G的卡，备份出来的镜像就是32G。那么有没有一种方法能把镜像缩小呢？当然有！[PiShrink](https://github.com/Drewsif/PiShrink)脚本能够快速的重排镜像中的`inode`节点，缩减未使用的部分。

### 更换软件源
`Raspbian`上不是只有一个`apt`源，还有一个`archive.raspberrypi.org`源，文件位置在`/etc/apt/sources.list.d/raspi.list`，科大和清华都有对应的国内源，找出来把原本的替换掉即可。例如USTC源的[使用帮助](http://mirrors.ustc.edu.cn/help/archive.raspberrypi.org.html)