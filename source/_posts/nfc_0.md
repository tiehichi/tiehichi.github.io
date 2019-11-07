---
title: 在树莓派上使用 PN532 NFC读卡器[0]——libnfc的安装配置
date: 2017-07-04
desc: libnfc, pn532, raspberry pi, 树莓派
---
最近需要在树莓派上使用使用NFC读取mifare classic卡中的信息，在X宝购买了一块PN532芯片的NFC读卡器，然后使用libnfc提供的接口进行开发，本文介绍一下libnfc的基本使用方法。
<!--more-->

### PN532芯片介绍

>PN532是一个高度集成的NFC读写芯片，它包含80C51微控制器内核，集成了13.56MHz下的各种主动/被动式非接触通信方法和协议。

此处给出PN532的[DataSheet](https://cdn-shop.adafruit.com/datasheets/pn532ds.pdf)和[UserManual](http://www.nxp.com/docs/en/user-guide/141520.pdf)。

PN532支持三种与主机之间的通信接口（可能还支持USB，不过我这块PN532板子上没有USB接口）：
* SPI
* I2C
* UART

PN532传输模块支持6种不同的工作模式：
* 读写器模式，支持ISO/IEC 14443A / MIFARE®机制
* 读写器模式，支持 FeliCa机制
* 读写器模式，支持ISO/IEC 14443B机制
* 卡操作模式，支持ISO 14443A / MIFARE®机制
* 卡操作模式，FeliCa机制
* ISO/IEC18092，ECM340点对点

本文中使用SPI与Raspberry Pi3之间进行通信，接线图就不放了，SPI接口一共就那么几根线。其实使用libnfc进行开发的话，使用什么接口都一样，libnfc会处理底层的通信细节，让开发者专注于PN532于芯片卡之间的通信过程。下文将讲述libnfc的配置方法。

### libnfc介绍

>libnfc是GNU公共许可正下发布的第一个免费的底层的NFC SDK和编程API。它对任何人都是完全免费和公开的。这个列表给出了目前[已经支持的功能](http://nfc-tools.org/index.php?title=Libnfc:Features)。libnfc支持所有的主流操作系统，包括GNU/Linux、Mac OS X和windows。其编译工作应该在兼容POSIX的系统中进行。libnfc库支持[多种NFC硬件](http://nfc-tools.org/index.php?title=Devices_compatibility_matrix)，如dongles、flat 和 OEM设备等。libnfc当前支持ISO/IEC 14443协议A、B，Felica、Jewel/Topaz标签和发起者和接收者的点对点数据交换。

在libnfc支持的[硬件列表](http://nfc-tools.org/index.php?title=Devices_compatibility_matrix)中发现，其对PN532的各种接口都提供了很好的支持，So，放心的使用libnfc吧！（说的好像还有别的库可以用一样......）

目前libnfc的版本停留在1.7.1，可以从GitHub上得到它的[源码](https://github.com/nfc-tools/libnfc)，该网页有libnfc的[官方文档](http://www.libnfc.org/api/index.html)。

### libnfc安装与配置

开发环境为树莓派3，系统是Raspbian。

1. 安装libnfc的依赖库
    ``` bash
    sudo apt-get install libusb-dev libpcsclite-dev
    ```
2. 安装libnfc
    
    这里有两种安装方法，直接使用apt安装和源码编译安装。
    * apt安装
        ``` bash
        sudo apt-get install libnfc-dev libnfc-bin
        ```
        其中`dev`包包含libnfc的头文件和链接库文件，`bin`包包含了一些预编译的二进制工具（其实就是源码文件夹`example`里面的东西）。
    * 源码安装
        
        其实源码安装也很简单粗暴，在Raspbian上也没有遇到什么莫名其妙的问题。

        首先安装CMake，如果已经安装了请忽略这一步：
        ``` bash
        sudo apt-get install cmake
        ```
        然后`cd`到libnfc的源码目录中，建立一个build文件夹，在build文件夹中进行编译安装：
        ``` bash
        mkdir build
        cd build
        cmake ..
        make
        sudo make install
        sudo ldconfig
        ```
    至此libnfc安装完成。

3. 配置libnfc
    libnfc安装完成后，需要编辑配置文件`/etc/nfc/libnfc.conf`，使其能够找到PN532设备，如果系统中没有这个文件，创建它，然后在文件中添加以下内容：
    ```
    # Allow device auto-detection (default: true)
    # Note: if this auto-detection is disabled, user has to set manually a device
    # configuration using file or environment variable
    allow_autoscan = true

    # Allow intrusive auto-detection (default: false)
    # Warning: intrusive auto-detection can seriously disturb other devices
    # This option is not recommended, user should prefer to add manually his device.
    allow_intrusive_scan = false

    # Set log level (default: error)
    # Valid log levels are (in order of verbosity): 0 (none), 1 (error), 2 (info), 3 (debug)
    # Note: if you compiled with --enable-debug option, the default log level is "debug"
    log_level = 1

    # Manually set default device (no default)
    # To set a default device, you must set both name and connstring for your device
    # Note: if autoscan is enabled, default device will be the first device available in device list.
    device.name = "PN532"
    device.connstring = "pn532_spi:/dev/spidev0.0"
    ```
    如果你使用i2c进行通信，将最后一行改为：
    ```
    device.connstring = "pn532_i2c:/dev/i2c-1"
    ```
    使用串口同理，修改最后一行的设备节点为你的串口设备。

    配置完成后，使用`nfc-list`查看是否配置成功，如果你是使用`apt`安装的`libnfc-bin`，直接在终端中输入`nfc-list`即可；如果使用源码安装libnfc，这个工具在libnfc源码文件夹中的`build/utils`文件夹中。
    运行`nfc-list`后如果看到如下输出，表示libnfc已经配置完成：
    ![result.png](https://i.loli.net/2019/01/05/5c3078255dc4e.png)
    <div class="tip">
    一般情况下不会出现配置失败的情况，如果配置失败，即未能成功打开PN532设备，请检查：树莓派的对应接口是否已经配置，如SPI、I2C等；接线是否正确；PN532设备能否正常工作等。
    </div>

### 待续
配置完成libnfc使之能够找到PN532设备之后，才是本系列的重点，请看下文__[在树莓派上使用 PN532 NFC读卡器[1]——Mifare Classic 1K 协议解析](http://tiehichi.site/2017/09/18/archives/nfc_1/)__
