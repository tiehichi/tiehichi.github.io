---
title: 记一次失败的刷机经历
date: 2017-08-14
desc: Sony Z5P, lineage OS
---
无意间在网上看到了有sony z5p的非官方版的Lineage OS了，准备刷一下试试看，在XDA上看到卡刷需要使用Lineage定制的TWRP刷入，于是从网上找了个TWRP的img镜像准备刷进去，结果......
<!--more-->
想了一下，img文件嘛，用flashtool刷不是很方便嘛，打开flashtool，手机进到fastboot，选择img文件，刷入kernel，完美。重启开机，嗯？怎么进到TWRP了，我要进系统啊，难道是刚刷入TWRP要进行什么设置？不管了，瞎**设置一通，重启......卧槽又进TWRP了！这时我意识到

![not-simple.png](https://i.loli.net/2019/01/05/5c30776ec4dfe.png)

想了一下，感觉流程没什么问题啊，此时机智的我想起来看一下flashtool的日志。发现问题了！我在flashtool的日志上看到`写入boot分区成功`，这boot分区按理来说应该是存放kernel镜像的，系统启动的时候会从boot分区加载内核镜像，我现在把recovery写进了boot分区，那开机必然会直接进入recovery......

搞清楚了问题的原因，那解决方法就很明朗了，再搞个内核重新刷呗。既然已经决定要刷机了，干脆直接把系统刷成`Lineage OS`，经过一番搜索，在[XDA](https://forum.xda-developers.com/z5-premium/development/lineageos-14-1-z5p-e6853-t3576995)上看到非官方版的`Lineage OS`已经提供了`fastboot`刷机所需要的各种镜像文件，全部下载下来，开搞。
```
fastboot -S 256M flash boot boot.img
fastboot -S 256M flash system system.img
fastboot -S 256M flash userdata userdata.img
fastboot -S 256M flash cache cache.img
```
刷完这些东西应该能进系统了，不过还是顺便把TWRP刷一下，这次不会出问题了！
```
fastboot flash recovery lineage_twrp_recovery.img
```
拔下数据线，开机成功！

总结：瞎**操作之前要先动脑子。
