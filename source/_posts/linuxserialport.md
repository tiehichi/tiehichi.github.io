---
title: Linux串口开发
date: 2017-11-16
desc: linux serial port 串口开发 Linux串口编程
---
一直以来在Linux下用到串口的时候都是用Python的pyserial库操作，现在发现直接使用Linux的系统调用操作串口还真是挺复杂的。
<!--more-->

得益于Linux一切皆文件的思想，串口的读写可以直接使用`read`、`write`系统调用操作`/dev`目录下的串口设备节点，串口开发复杂的地方在于串口属性的配置，十分繁琐。

### 串口设备属性配置
一般来说，使用串口设备需要配置的属性有：波特率、数据位、停止位、校验位。Linux中，这些属性使用`struct termios`结构进行存储，该结构定义在`termios.h`头文件中，查看系统的[man手册](https://linux.die.net/man/3/termios)可以看到该结构的详细介绍。该结构至少包含以下属性：
``` C
struct termios
{   
    tcflag_t c_iflag;      /* input modes */
    tcflag_t c_oflag;      /* output modes */
    tcflag_t c_cflag;      /* control modes */
    tcflag_t c_lflag;      /* local modes */
    cc_t     c_cc[NCCS];   /* special characters */
};
```

使用`tcgetattr()`、`tcsetattr()`函数可以读取或设置串口设备的属性，函数原型见[man手册](https://linux.die.net/man/3/termios)。
``` C
struct termios portOption;

// fd: 串口设备文件描述符，使用 open 函数创建
tcgetattr(fd, &portOption);     // 读取串口设备属性，存入portOption中
tcsetattr(fd, TCSANOW, &portOption);    // 设置设备属性， “TCSANOW”参数表示使属性立即生效
```

__波特率的设置__

可以使用`cfsetispeed()`、`cfsetospeed()`分别设置串口的输入、输出波特率，使用`cfgetispeed()`、`cfgetospeed()`分别获取串口的输入、输出波特率。波特率的数据类型为`speed_t`，是一个枚举类型，其取值范围可以查看[man手册](https://linux.die.net/man/3/termios)
``` C
cfsetispeed(&portOption,B115200);   //设置为115200Bps
cfsetospeed(&portOption,B115200);
```
注意，该设置仅为修改`struct termios`结构的值，要让设置生效还需要使用`tcsetattr()`函数。

__数据位设置__

数据位长度可以设置为5、6、7、8，分别对应宏CS5、CS6、CS7、CS8，根据需要将对应的宏与`struct termios`结构中的`c_cflag`字段按位或即可，这种设置属性的方法很符合Unix风格。
``` C
portOption.c_cflag |= CS7;  // 7位数据位
portOption.c_cflag |= CS8;  // 8位数据位
```

__停止位设置__

`termios.h`中定义了一个宏`CSTOPB`来表示两位停止位，如果需要设置2位停止位，同数据位设置一样与`c_cflag`按位或即可。如果要设置1位停止位，则对CSTOPB取反再与`c_cflag`按位与。
``` C
portOption.c_cflag |= CSTOPB;   // 2位停止位
portOption.c_cflag &= ~CSTOPB;  // 1位停止位
```

__校验位设置__

涉及校验的宏定义有`INPCK`、`PARENB`、`PARODD`：
- INPCK：开启输入校验
- PARENB：开启输入输出时的校验码生成
- PARODD：设置奇校验
使用这三个宏，即可设置校验方式：
``` C
/* 无校验 */
portOption.c_cflag &= ~PARENB;
portOption.c_cflag &= ~INPCK;

/* 奇校验 */
portOption.c_cflag |= PARENB;
portOption.c_cflag |= PARODD;
portOption.c_cflag |= INPCK;

/* 偶校验 */
portOption.c_cflag |= PARENB;
portOption.c_cflag &= ~PARODD;
portOption.c_cflag |= INPCK;
```

注意：如果不是开发串口终端，而仅仅使用串口传输数据，则数据需要使用RAW Mode进行传输：
``` C
portOption.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);  /*Input*/
portOption.c_oflag &= ~OPOST;   /*Output*/
```
也可以偷懒使用`termios.h`中提供的函数`cfmakeraw()`
``` C
cfmakeraw(&portOption);
```

### 阻塞与非阻塞
串口设备的读写阻塞与非阻塞不仅仅与设备节点被`open`的时候设置的参数有关，还与`struct termios`结构中`c_cc[VMIN]`和`c_cc[VTIME]`有关。

参考`wiringPi`库和`pyserial`的实现，我发现大家再打开串口设备的时候都是将其设置为非阻塞，然后在设置完设备属性后再使用`fcntl()`将其设置为阻塞。
``` C
int fd = open("/dev/ttyS0", O_RDWR | O_NOCTTY | O_NONBLOCK | O_NDELAY);
...
/* 设置属性... */
...
fcntl(fd, F_SETFL, 0);  // 设置为阻塞模式
```

设置完文件描述符的属性，还需要根据`c_cc[VMIN]`和`c_cc[VTIME]`才能确定读写的时候是否为阻塞模式，这两项的组合如下：
- c_cc[VMIN]==0; c_cc[VTIME]==0;
    
    非阻塞，`read`函数将立即返回实际读取的字节数，没有读取到则返回0

- c_cc[VMIN]>0; c_cc[VTIME]==0;

    阻塞，串口缓冲区中至少有`c_cc[VMIN]`个字节可供读取时，`read`才会返回，`read`的返回值为`c_cc[VMIN]`与`read`的`len`参数中的较小者。

- c_cc[VMIN]==0; c_cc[VTIME]>0;

    这种情况下，当调用`read`时，计时器开始计时，`c_cc[VTIME]`的单位为十分之一秒，如果计时超过`c_cc[VTIME]`设置的时间，`read`将会返回0，或者缓冲区中至少有一个字节可供读取，`read`正常返回，否则将会阻塞。

- c_cc[VMIN]>0; c_cc[VTIME]>0;

    该情况中从调用`read`并且缓冲区中至少有一个字节可用时，计时器开始计时，并且每次调用`read`且缓冲区中有数据可供读取时，计时器会重新计时，直到计时器超时或者`read`已经读到`len`个字节，`read`会返回实际读取的字节数。注意在该情况下，如果缓冲区中没有可供读取的数据，那么计时器不会启动，`read`将被一直阻塞。

### 分析
使用`c_cc[VMIN]`与`c_cc[VTIME]`可以灵活的按需设置串口读取的阻塞与非阻塞状态。非阻塞`read`直接设置`c_cc[VMIN]==0; c_cc[VTIME]==0;`即可；阻塞的设置相对比较复杂：

1. 如果需要保证每次`read`的字节数，可以设置`c_cc[VMIN]>0; c_cc[VTIME]==0;`，但是需要注意，`c_cc[]`的数据类型`cc_t`实际上为`unsigned char`，其取值范围为`0~255`

2. 如果需要为`read`设置超时时间，需要注意后面两种情况的超时是不同的。`c_cc[VMIN]==0; c_cc[VTIME]>0;`只能确保串口缓冲区中有数据可读，但是无法保证实际`read`到的字节数量；`c_cc[VMIN]>0; c_cc[VTIME]>0;`能够确保`read`到的字节数量，但是`read`每读取一个字节会重新设置计时器，即设置的超时时间并不是`read`超时返回的时间，并且需要注意，当缓冲区无数据可读时，计时器并不会启动，`read`将被一直阻塞。

从某种意义上来说，串口超时的设置都不是“真正的”超时，并非从`read`函数被调用到超时返回的真实时间。`pyserial`库中的`read`函数是可以设置其超时返回时间的，参考其源码发现可以使用`select()`来实现“真正的”超时。

为了同时保证`read`读取的字节数和超时返回的时间，换一种思路就是使用`c_cc[VMIN]>0; c_cc[VTIME]==0;`来保证`read`读取的字节数，使用`select()`函数来设置超时：
``` C
fd_set set;
struct timeval timeout;

timeout.tv_sec = 5;     // 设置超时时间为5s
FD_ZERO(&set);
FD_SET(fd, &set);

portOption.c_cc[VMIN] = 255;
portOption.c_cc[VTIME] = 0;
tcsetattr(fd, TCSANOW, &portOption);

switch(select(fd+1, &set, NULL, NULL, &timeout))
{
    case 0:
        /* timeout */
    case -1:
        /* select() error */
    default:
        read(fd, buffer, len);
}
```
关于`select()`函数的使用方法可以参考[man手册](https://linux.die.net/man/3/select)