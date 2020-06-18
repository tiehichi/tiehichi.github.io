---
title: 为树莓派编译Qt5.8(Embedded)
date: 2017-07-09
desc: raspberry pi qt5.8 qtvirtualkeyboard 虚拟键盘
categories: 
- 树莓派
---

为了在树莓派上使用Qt提供的虚拟键盘，最开始我将虚拟键盘的源码下载到树莓派上，使用Raspbian软件源中的Qt5库进行编译，结果运行时发现弹出虚拟键盘时，屏幕上除了虚拟键盘以外的区域均为黑色，无法正常显示其他窗口，猜测可能是虚拟键盘在X Window上显示有问题。为了解决这个诡异的问题，我决定为树莓派编译Qt5.8，交叉编译完的Qt显示时将绕过X Window，直接走FrameBuffer将图形显示在屏幕上，这样应该可以解决虚拟键盘在X Window上显示的问题。
<!--more-->

### 准备工作
1. __一个正常运行的Linux系统__

    编译工作需要在Linux系统（任意发行版均可）下进行，可以跑在虚拟机上，也可以是物理机，如果是虚拟机的话，记得分配多一点硬盘空间，建议40G左右。

2. __设置环境变量__

    这一步主要是为了方便后面的编译工作，我的编译工作全部在`~/rpi`文件夹中进行，将后续会用到的交叉编译工具以及Qt源码、Raspbian镜像等全部放在该文件夹中。
    ``` bash
    export RPIROOT=$HOME/rpi
    export RPIIMG=$RPIROOT/rasp-pi-rootfs
    export RPIQT=$RPIROOT/qt5pi
    mkdir $RPIROOT
    mkdir $RPIIMG
    cd $RPIROOT
    ```
    为了使用方便，可以将这些`export`放在一个文件中，需要时`source`就可以了。我将这些环境变量的设置全部放在`$RPIROOT/rpi.env`文件中。

3. __交叉编译工具__

    树莓派的交叉编译工具可以从官方GitHub上获取到，将其`clone`到`$RPIROOT`文件夹中。
    ``` bash
    git clone https://github.com/raspberrypi/tools.git
    ```
    下载完成后，设置一下交叉编译工具的环境变量，同样可以将其放在`.env`文件中
    ``` bash
    export PATH=$PATH:$RPIROOT/tools/arm-bcm2708/gcc-linaro-arm-linux-gnueabihf-raspbian-x64/bin
    ```
    如果你是32位的系统，将`-x64`去掉。

4. __下载树莓派Raspbian镜像__

    树莓派的系统镜像可以直接从树莓派官方网站[下载](https://www.raspberrypi.org/downloads/raspbian/)，我这里使用的是官方的`2017-04-10-raspbian-jessie-lite.img`。
    <div class="tip">
    建议使用官方的Lite镜像，Lite版本不包含图形环境，而编译完成的Qt5.8将直接通过FrameBuffer进行显示，因此没必要使用包含图形环境的树莓派镜像；而且X Window的显示与FrameBuffer的显示呈现在同一个屏幕上，FrameBuffer的显示将会遮盖X Window的显示，但是通过鼠标对FrameBuffer的显示窗口进行操作时，鼠标事件同样会被X Window所捕获，会发生冲突。
    </div>

5. __获取Qt源码__

    Qt源码同样下载到`$RPIROOT`文件夹中。
    ``` bash
    git clone https://code.qt.io/qt/qt5.git
    ```
    下载完成后，`checkout`到你需要编译的Qt版本中
    ``` bash
    cd qt5
    git checkout v5.8.0
    ```
    完成后，使用`qt5`文件夹中的`init-repository`工具初始化仓库，该过程将下载Qt各个模块的源码。
    ``` bash
    ./init-repository
    ```
    该过程需要网络连接，如果在初始化过程中由于某些原因导致下载失败，使用`-f`参数继续初始化，直至全部模块下载完成。
    ``` bash
    ./init-repository -f
    ```

### 挂载Raspbian镜像
首先使用`fdisk -l`命令查看一下镜像文件的结构：
``` bash
fdisk -l 2017-04-10-raspbian-jessie-lite.img
```
输出结果如下：
```
Disk 2017-04-10-raspbian-jessie-lite.img：1.2 GiB，1297862656 字节，2534888 个扇区
单元：扇区 / 1 * 512 = 512 字节
扇区大小(逻辑/物理)：512 字节 / 512 字节
I/O 大小(最小/最佳)：512 字节 / 512 字节
磁盘标签类型：dos
磁盘标识符：0x84fa8189

设备                                 启动  起点    末尾    扇区  大小 Id 类型
2017-04-10-raspbian-jessie-lite.img1       8192   92159   83968   41M  c W95 FAT32 (LBA)
2017-04-10-raspbian-jessie-lite.img2      92160 2534887 2442728  1.2G 83 Linux
```
可以看到该镜像文件共有两个分区，其中img1为树莓派的bootloader，img2为raspbian的根文件系统，我们需要挂载的就是该镜像中的第二个分区，其格式为ext4。注意该镜像中，一个扇区为`512 Byte`，而img2分区的起点是第`92160`号扇区，那么挂载该分区时，其偏移量应为`512 × 92160`：
``` bash
sudo mount -o loop,offset=$((512 * 92160)) 2017-04-10-raspbian-jessie-lite.img $RPIIMG
```
不同的系统镜像其根文件系统的起始扇区可能不同，偏移量请根据`fsidk -l`的输出确定。

### 修复相对链接
由于镜像的挂载点与我们即将使用的交叉编译工具不在同一个根文件系统中，可能会出现一些相对连接的问题，这里需要使用工具修复relative links。
首先确保已经安装交叉编译工具，并将其加入系统`PATH`，然后下载并执行symlink修复工具：
``` bash
wget https://raw.githubusercontent.com/riscv/riscv-poky/master/scripts/sysroot-relativelinks.py
sudo python sysroot-relativelinks.py $RPIIMG
```

### 编译Qt Base
终于可以开始Qt的编译了，我们首先要做的是生成交叉编译用的`qmake`，编译安装`qtbase`库：
``` bash
cd $RPIROOT/qt5/qtbase
./configure -opengl es2 -device linux-rasp-pi2-g++ -device-option CROSS_COMPILE=$(which arm-linux-gnueabihf-gcc | sed 's/.\{3\}$//') -sysroot $RPIIMG -opensource -confirm-license -optimized-qmake -reduce-exports -release -make libs -prefix /usr/local/qt5pi -extprefix /opt/qt5pi -hostprefix $RPIQT
make -j4
make install
```
`config`命令后面的那一大堆参数我是根据[官方教程](https://wiki.qt.io/RaspberryPi2EGLFS)来的, ~~其中`-device linux-rasp-pi2-g++`适用于树莓派2和3（不用试了没有`linux-rasp-pi3-g++`）~~其中`-device`选项可以根据Qt源码目录下`qtbase/mkspecs/devices`文件夹进行选择，包括`linux-rasp-pi2-g++`以及`linux-rpi3-g++`等设备类型，如果你是树莓派1代，使用`linux-rasp-pi-g++`；`which arm-linux-gnueabihf-gcc | sed 's/.\{3\}$//'`得到的值是交叉编译器的路径及其前缀(即`arm-linux-gnueabihf-`)；`-sysroot`参数指定根文件系统的位置；`-prefix`指定在根文件系统中的安装路径；`-extprefix`参数设置后，安装qt时将在你的系统中该路径下同时安装一份，交叉编译Qt项目时qmake将使用该路径下的Qt lib；`-hostprefix`指定的是需要安装在宿主机的部分的路径，如`qmake`等工具是安装在宿主机中的；如果需要编译example，加上`-make example`。
<div class="tip">
如果make过程中出现错误，我也没什么办法，清理仓库重新来过吧......
</div>

### 编译Qt子模块
编译安装完成qtbase后，就可以开始编译安装各个子模块了，注意使用刚刚生成的`qmake`来配置项目，比如我需要编译`qtvirtualkeyboard`:
``` bash
cd $RPIROOT/qt5/qtvirtualkeyboard
$RPIQT/bin/qmake .
make -j4
sudo make install
```
注意Qt子模块之间的依赖关系，比如`qtvirtualkeyboard`依赖`qtquick2`，而`qtquick2`在`qtdeclarative`中，所以需要先安装`qtdeclarative`才能编译安装`qtvirtualkeyboard`。

### Qt VirtualKeyboard
如果需要`qtvirtualkeyboard`提供拼音输入支持，在配置项目时添加参数`CONFIG+='lang-en_GB lang-zh_CN'`，即：
``` bash
cd $RPIROOT/qt5/qtvirtualkeyboard
$RPIQT/bin/qmake CONFIG+='lang-en_GB lang-zh_CN'
make -j4
sudo make install
```
这样在使用虚拟键盘时就能够选择拼音输入法。

### 结束
卸载根文件系统：
``` bash
sudo umount $RPIIMG
```
此时Raspbian镜像中已经包含了Qt5.8库，PC端编写代码使用`$RPIQT/bin/qmake`配置编译完后，生成的二进制文件放在树莓派上就可以正常运行啦。经测试，虚拟键盘在`QtWidget`项目中弹不出来，但是对`qml`项目的支持非常好，反正也没什么别的解决方案，就这么凑合着用吧～
