---
title: 减小Docker镜像的体积
date: 2019-10-13
categories: 
- docker
---
# 减小Docker镜像的体积
在构建用于`高通sectools`签名工具的`Docker`镜像时，发现一个问题：我基于`alpine 3.2`构建的镜像，居然比同事基于`ubuntu 16.04`构建的镜像体积更大，感觉没什么道理
```bash
secboot			dev			fcb2114cfdb8		13 seconds ago		241MB        # 我的
ubuntu			secboot		4e637fb3bcc5		19 hours ago		186MB        # 同事的
```
`Dockerfile`长这样

```dockerfile
FROM alpine:3.2

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache \
    python \
    openssl \
    squashfs-tools \
    cryptsetup \
    fakeroot \
    libxml2-utils \
    lzo \
    bash

RUN apk add --no-cache --virtual .build-deps \
    git \
    make \
    python-dev \
    py-pip \
    lzo-dev \
    gcc \
    libc-dev \
    autoconf \
    automake \
    pkgconf \
    libtool \
    util-linux-dev \
    zlib-dev \
    linux-headers

RUN cd /root && \
    git clone git://git.infradead.org/mtd-utils.git && \
    cd mtd-utils && git checkout v2.0.2 && \
    ./autogen.sh && ./configure && make && make install && \
    cd /root && rm -rf mtd-utils && \
    pip install python-lzo

RUN apk del .build-deps
WORKDIR /root
CMD ["/bin/bash"]
```
## 分析

为了找出镜像过大的原因，我开始一段一段的`build`，测试镜像的大小，终于在最后一个`RUN`的位置发现了问题
这是运行`apk del .build-deps`前后的镜像大小

```bash
secboot		dev		53016ef2a6c6        34 minutes ago      240MB        # apk del之前
secboot		dev		fcb2114cfdb8        35 minutes ago      241MB        # apk del之后
```
我确认上面的注释不是我写错了，而是确实`apk del`之后镜像比之前还大了`1M`；仔细思考之后，我觉得应该是镜像分层造成的最终镜像过大。

查询之后发现有个命令可以查看`Docker`镜像的分层情况
```bash
docker history <repository>:<tag>
```
查看`secboot:dev`镜像的分层结果如下
```bash
IMAGE			CREATED			CREATED BY                                      SIZE
0362b4c01d3d	4 seconds ago	/bin/sh -c #(nop)  CMD ["/bin/bash"]            0B
021384a78602    4 seconds ago   /bin/sh -c #(nop) WORKDIR /root                 0B
e3cc8dc505b8    4 seconds ago   /bin/sh -c apk del .build-deps                  167kB
18bba3b26848    6 seconds ago   /bin/sh -c cd /root &&     git clone git://g…   2.86MB
412c22750681	2 minutes ago   /bin/sh -c apk add --no-cache --virtual .bui…   192MB
84a93104b094	3 minutes ago	/bin/sh -c sed -i 's/dl-cdn.alpinelinux.org/…   40.6MB
98f5f2d17bd1	8 months ago    /bin/sh -c #(nop)  CMD ["/bin/sh"]              0B
<missing>		8 months ago	/bin/sh -c #(nop) ADD file:3b4be7a9f665764de…   5.27MB
```

从分层结果可以看到，第五个层占用了`192M`的空间，其对应`Dockerfile`中的命令应该是`apk add --no-cache --virtual .build-deps`命令；所以镜像过大的原因应该是`apk del .build-deps`只在第三层中卸载了软件包并叠加在第四层上，而第五层安装的软件包仍然存在。

## 优化

### 合并层级

最简单的优化方法当然是将`apk add --no-cache --virtual .build-deps`到`apk del .build-deps`合并到一个层中，这样安装软件包的时候不会创建新的层级，使用完后卸载软件包，也不会使改层级占用过大的空间。

```dockerfile
RUN apk add --no-cache --virtual .build-deps \
    git \
    make \
    python-dev \
    py-pip \
    lzo-dev \
    gcc \
    libc-dev \
    autoconf \
    automake \
    pkgconf \
    libtool \
    util-linux-dev \
    zlib-dev \
    linux-headers \
    && \
	cd /root && \
    git clone git://git.infradead.org/mtd-utils.git && \
    cd mtd-utils && git checkout v2.0.2 && \
    ./autogen.sh && ./configure && make && make install && \
    cd /root && rm -rf mtd-utils && \
    pip install python-lzo \
    && \
	apk del .build-deps
```

再次`build`查看分层情况

```bash
IMAGE         CREATED              CREATED BY                                      SIZE
9ab88d516323  About a minute ago   /bin/sh -c #(nop)  CMD ["/bin/bash"]            0B
10ce23bc619c  About a minute ago   /bin/sh -c #(nop) WORKDIR /root                 0B
197866cc1784  About a minute ago   /bin/sh -c apk add --no-cache --virtual .bui…   3.32MB
84a93104b094  30 minutes ago       /bin/sh -c sed -i 's/dl-cdn.alpinelinux.org/…   40.6MB
98f5f2d17bd1  8 months ago         /bin/sh -c #(nop)  CMD ["/bin/sh"]              0B
<missing>	  8 months ago         /bin/sh -c #(nop) ADD file:3b4be7a9f665764de…   5.27MB
```

可以看到刚才占了`192M`空间的`IMAGE`没了，刚才的3、4、5层合并成现在的第三层，仅仅占用了`3.32M`的空间，镜像的最终大小也降至`49M`。

### 利用Docker的多阶段构建进行压缩

`Docker`的多阶段构建类似于这样

```dockerfile
FROM node:8 as build
WORKDIR /app
COPY package.json index.js ./
RUN npm install

FROM node:8
COPY --from=build /app /
EXPOSE 3000
CMD ["index.js"]
```

二阶段构建时将前一阶段的构建结果拷贝到当前镜像中，相当于将前一阶段的结果`merge`到当前阶段的构建当中。

![](https://s3.amazonaws.com/infoq.content.live.0/articles/3-simple-tricks-for-smaller-docker-images/zh/resources/92-1535708975704.gif)

对于我当前的`Dockerfile`，要通过多阶段编译来缩小镜像，需要调整一下执行顺序，让编译`mtd-utils`的过程作为一阶段构建，二阶段构建直接使用前一阶段的结果。

``` dockerfile
FROM alpine:3.2 as build_mtd_utils

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache python && \
    apk add --no-cache --virtual .build-deps \
    git \
    make \
    python-dev \
    py-pip \
    lzo-dev \
    gcc \
    libc-dev \
    autoconf \
    automake \
    pkgconf \
    libtool \
    util-linux-dev \
    zlib-dev \
    linux-headers

RUN cd /root && \
    git clone git://git.infradead.org/mtd-utils.git && \
    cd mtd-utils && git checkout v2.0.2 && \
    ./autogen.sh && ./configure && make && make install && \
    cd /root && rm -rf mtd-utils && \
    pip install python-lzo

RUN apk del .build-deps

FROM alpine:3.2
COPY --from=build_mtd_utils / /
RUN apk add --no-cache \
    openssl \
    squashfs-tools \
    cryptsetup \
    fakeroot \
    libxml2-utils \
    lzo \
    bash

WORKDIR /root
CMD ["/bin/bash"]
```

看看编译后的分层情况

```bash
IMAGE			CREATED			CREATED BY                                      SIZE
3d27fb3a9c4c	30 seconds ago	/bin/sh -c #(nop)  CMD ["/bin/bash"]			0B
dd3f19eac44d	30 seconds ago	/bin/sh -c #(nop) WORKDIR /root					0B
155f84cb7918	30 seconds ago	/bin/sh -c apk add --no-cache     openssl   …   4.21MB
d166bc1eb44c	39 seconds ago	/bin/sh -c #(nop) COPY dir:c1b109c276e386ad4…   44.9MB
98f5f2d17bd1	8 months ago	/bin/sh -c #(nop)  CMD ["/bin/sh"]              0B
<missing>		8 months ago	/bin/sh -c #(nop) ADD file:3b4be7a9f665764de…   5.27MB
```

第四层的`COPY`就是使用了前一阶段的构建结果；这种构建方式最终镜像的大小会比前面合并层级的方式稍大，原因是第四层在使用前一阶段构建结果时，已经包含了基础镜像的大小，所以第六层的基础镜像层就多了出来。

除了镜像稍大之外，这种构建方式还会创建一个多余的匿名镜像

```bash
-> % docker images
REPOSITORY          TAG                 IMAGE ID            CREATED              SIZE
secboot             dev                 3d27fb3a9c4c        About a minute ago   54.4MB
<none>              <none>              3449aa1a3034        About a minute ago   238MB
```

可以看到`secboot:dev`镜像比前面合并层级的优化方式多了`5M`，并且多出了一个`238M`的匿名镜像；这个镜像这么大的原因仍然是我将`apk add`和`apk del`放在两个层级中。

### 使用`distroless`

待调研