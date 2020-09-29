---
title: 为什么static函数不能mock
date: 2020-09-29
categories: 
- 单元测试
---
# 为什么static函数不能mock

在使用`cmocka`单元测试框架进行单元测试的过程中，发现声明为`static`的函数是不能`mock`的；为什么这类函数无法被`mock`呢？需要先分析一下`mock`函数的实现原理。

## 通过连接器参数进行`mock`

很多`C`语言的单元测试框架，需要通过设置链接器参数来实现函数的`mock`，例如想要`mock` `open`这个系统调用，需要在编译时添加参数：

``` bash
-Wl,--wrap=open
```

`-Wl`是指后面的参数是添加给连接器的；指定该参数后，调用`open`的时候会转而调用`__wrap_open`，所以我们只需要实现一个`__wrap_open`函数，就可以屏蔽`open`系统调用；如果需要调用原来的`open`函数，可以显式调用`__real_open`。

## `mock`的原理

根据`mock`的实现方式，我们可以确定`C`语言的`mock`实现是连接器在链接程序时，将`open`符号链接到`__wrap_open`，并且将`__real_open`符号链接到系统调用`open`。

## 不能`mock`的函数

确定了`mock`的实现方式，就可以分析一下这些不能`mock`的函数究竟为什么不能`mock`。

声明为`static`的函数，特点是只能在当前文件内使用，所以如果被测试函数调用了`static`的函数，这两个函数必然在同一个文件中，并且不能被其他文件中的函数调用。

## 为什么

为了确认这个问题，我们准备一份测试用的代码，分为两个`.c`文件：

``` C
/*
 * func.c
 */
#include <stdio.h>

static int function_1() {
    return 12;
}

int function_2() {
    int x = function_1();
    printf("x = %d\n", x);
    return x;
}
```

``` C
/*
 * main.c
 */
#include <stdio.h>

extern int function_2();

int main(void) {
    function_2();

    return 0;
}
```

编译生成`.o`文件，并链接生成可执行文件

``` bash
gcc -g -O0 -c func.c
gcc -g -O0 -c main.c
gcc -o main main.o func.o -g -O0
```

接着我们来分析一下`function_2()`函数，函数中有两次函数调用，一次调用同文件中的`function_1()`，另一次调用`printf()`，所以其对应的汇编代码中，应该存在两个`callq`指令(`x64`平台)；所以我们来使用`objdump`来反汇编一下`func.o`：

``` bash
-> % objdump -d func.o

func.o:     file format elf64-x86-64


Disassembly of section .text:

0000000000000000 <function_1>:
   0:    f3 0f 1e fa              endbr64
   4:    55                       push   %rbp
   5:    48 89 e5                 mov    %rsp,%rbp
   8:    b8 0c 00 00 00           mov    $0xc,%eax
   d:    5d                       pop    %rbp
   e:    c3                       retq

000000000000000f <function_2>:
   f:    f3 0f 1e fa              endbr64
  13:    55                       push   %rbp
  14:    48 89 e5                 mov    %rsp,%rbp
  17:    48 83 ec 10              sub    $0x10,%rsp
  1b:    b8 00 00 00 00           mov    $0x0,%eax
  20:    e8 db ff ff ff           callq  0 <function_1>
  25:    89 45 fc                 mov    %eax,-0x4(%rbp)
  28:    8b 45 fc                 mov    -0x4(%rbp),%eax
  2b:    89 c6                    mov    %eax,%esi
  2d:    48 8d 3d 00 00 00 00     lea    0x0(%rip),%rdi        # 34 <function_2+0x25>
  34:    b8 00 00 00 00           mov    $0x0,%eax
  39:    e8 00 00 00 00           callq  3e <function_2+0x2f>
  3e:    8b 45 fc                 mov    -0x4(%rbp),%eax
  41:    c9                       leaveq
  42:    c3                       retq
```

注意`function_2`的汇编代码中，两个`callq`指令的不同：

``` asm
  20:    e8 db ff ff ff           callq  0 <function_1>
  39:    e8 00 00 00 00           callq  3e <function_2+0x2f>
```

`callq`指令码为`e8`，第一个`callq`调用`function_1`，地址为`ff ff ff db`，`x86`指令集上`callq`的地址用补码表示，所以这个地址实际上是个负数，对应的十进制为`-37`，`callq`下一条指令的起始地址，加上这个相对跳转地址，刚好是`function_1`的地址。

再看一下第二条`callq`指令，它的地址是`00 00 00 00`，实际上是等待填充，现在还不知道之后会跳转到哪。

再来反汇编可执行文件看一下：

``` bash
0000000000001171 <function_2>:
    1171:    f3 0f 1e fa              endbr64
    1175:    55                       push   %rbp
    1176:    48 89 e5                 mov    %rsp,%rbp
    1179:    48 83 ec 10              sub    $0x10,%rsp
    117d:    b8 00 00 00 00           mov    $0x0,%eax
    1182:    e8 db ff ff ff           callq  1162 <function_1>
    1187:    89 45 fc                 mov    %eax,-0x4(%rbp)
    118a:    8b 45 fc                 mov    -0x4(%rbp),%eax
    118d:    89 c6                    mov    %eax,%esi
    118f:    48 8d 3d 6e 0e 00 00     lea    0xe6e(%rip),%rdi        # 2004 <_IO_stdin_used+0x4>
    1196:    b8 00 00 00 00           mov    $0x0,%eax
    119b:    e8 b0 fe ff ff           callq  1050 <printf@plt>
    11a0:    8b 45 fc                 mov    -0x4(%rbp),%eax
    11a3:    c9                       leaveq
    11a4:    c3                       retq
    11a5:    66 2e 0f 1f 84 00 00     nopw   %cs:0x0(%rax,%rax,1)
    11ac:    00 00 00
    11af:    90                       nop

```

我们仍然关注`function_2`中的两条`callq`指令：

``` asm
    1182:    e8 db ff ff ff           callq  1162 <function_1>
    119b:    e8 b0 fe ff ff           callq  1050 <printf@plt>
```

第一条`callq`的相对跳转地址并未发生任何变化，但是第二条指令中，地址已经被填充，而不再是之前的`00 00 00 00`。

## 结论

根据前面的分析我们可以确定，`static`函数被调用时，调用地址再编译时就已经确定，并且在链接时不会再去改变它的相对地址；而我们的`mock`参数是添加在链接器上的，理所当然无法`mock` `static`函数。