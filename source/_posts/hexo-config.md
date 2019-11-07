---
title: 使用Hexo搭建博客
date: 2017-07-01
desc: 使用Hexo搭建博客
---
今天成功的在我的VPS上使用Hexo搭建了个人博客，在此把搭建流程记录下来，作为我的第一篇博文。
<!-- more -->

### 安装nodejs

安装`nodejs`的方法可以参考[此处](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-16-04#how-to-install-using-nvm)

### 安装配置Hexo

根据官网的提示，Hexo的安装十分简单
``` bash
nvm install hexo-cli -g
hexo init blog
cd blog
npm install
hexo server
```
这样就完成了hexo的安装和启动，关于hexo的配置以及更换主题，hexo有很详细的文档可以参考，这里就不做赘述了。

### 管理Hexo服务
使用`hexo server`这种方式启动的服务并非 Deamon模式，查阅网上的资料，有一篇[博客](http://russellluo.com/2015/08/building-a-blog-with-hexo.html)提到使用supervisor工具来管理hexo服务。

ubuntu上supervisor的安装十分简单：
``` bash
sudo apt install supervisor
```
安装完成后，添加hexo服务的配置，在文件`/etc/supervisor/conf.d/blog.conf`中添加如下行：
```
[program:blog]
command=/home/user/.nvm/v6.11.0/bin/hexo server
directory=/home/user/blog
autostart=true
autorestart=true
startsecs=5
stopsignal=HUP
stopasgroup=true
stopwaitsecs=5
stdout_logfile_maxbytes=20MB
stdout_logfile=/var/log/supervisor/%(program_name)s.log
stderr_logfile_maxbytes=20MB
stderr_logfile=/var/log/supervisor/%(program_name)s.log
```
其中`command`是hexo路径加上参数`server`，`directory`是你在`hexo init`的时候创建的hexo文件夹的路径。

编写完hexo服务的配置文件后，先别急着启动supervisor，因为会出现问题。上述hexo的配置中，将日志文件存放在`/var/log/supervisor`中，但是普通用户没有对该文件夹的读写权限，所以需要以root权限启动supervisor，但是前面安装的nodejs的环境变量是在普通用户下配置的，如果以root用户启动，就需要额外为root用户配置nodejs的环境变量，我觉得挺麻烦的，就采用另一种办法，修改`/var/log/supervisor`的所属组以及拥有者
``` bash
sudo chown -R user:users /var/log/supervisor
```
仅修改日志文件夹权限还不行，supervisor在启动的时候，需要用到UNIX本地套接字，这个文件将创建在`/var/run`目录下，而该目录普通用户也没有写权限，需要修改supervisor的配置文件，将该套接字文件的路径修改到`/tmp`目录下。

编辑文件`/etc/supervisor/supervisord.conf`，找到如下两行
```
file=/var/run/supervisor.sock
serverurl=unix:///var/run/supervisor.sock
```
可能你的系统中这两项参数的值跟我的不同，没关系，找到他们就行。然后将其修改为
```
file=/tmp/supervisor.sock
serverurl=unix:///tmp/supervisor.sock
```

`supervisor`服务本身使用`systemd`进行管理，所以可以使用
``` bash
systemctl { start | stop | restart | status } supervisor
```
查看`supervisor`服务的运行状态，仍然可以使用`supervisorctl status`查看被`supervisor`管理的服务运行状态。

如果出现`Permission denied`，记得加`sudo`

### 使用Nginx代理
启动Hexo服务后会发现，Hexo服务运行在4000端口上，这在一个博客系统中反映到url上总感觉怪怪的，但是直接使用`hexo server -p 80`这种方法，在我的系统上启动不了，没权限使用80端口，继续查阅资料，还是这篇[博客](http://russellluo.com/2015/08/building-a-blog-with-hexo.html)详细讲述了使用Nginx进行代理的方法。

首先安装Nginx
``` bash
sudo apt install nginx
```
安装完成后，在`/etc/nginx/conf.d`目录下创建hexo服务的配置文件`blog.conf`，当然文件名随你喜欢，在文件中添加如下行：
```
server {
    listen 80;
    server_name <SERVER-IP/DN>;

    location / {
        proxy_pass http://localhost:4000;
    }

    access_log  /var/log/nginx/blog.access.log;
    error_log /var/log/nginx/blog.error.log;
}
```
将其中的`<SERVER-IP/DN>`替换成你的服务器的IP或者域名，然后重启Nginx
``` bash
sudo nginx -t
sudo nginx -s reload
```

### 结束
以上配置全部完成后，你就可以在浏览器使用`http://<SERVER-IP/DN>`访问你的博客主页啦~
