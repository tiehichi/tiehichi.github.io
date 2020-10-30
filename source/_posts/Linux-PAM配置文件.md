---
title: Linux-PAM配置文件
date: 2020-10-30
categories:
- Linux-PAM
---

# `Linux-PAM`配置文件

`PAM`框架意为可拔插身份认证模块，该框架实现了通过模块化的方式配置Linux平台上的身份认证框架；我们常见的需要身份认证的应用，例如`login`、`ssh`、`su`等都可以接入`PAM`框架，使其能够方便的配置身份认证方式。

`pam`配置文件有两个路径：`/etc/pam.conf`和`/etc/pam.d/`，先来看`pam.conf`文件。

## `/etc/pam.conf` 配置文件语法

pam的配置文件以`stack`的形式来组织，每个配置文件相当于一个栈；在配置文件中，每条规则一行，每行有五个字段：

``` conf
service type control module-path module-argument
```

最后两个字段`module-path`和`module-argument`为需要调用的pam模块和传入模块的参数，根据模块的不同，支持的参数也不一样，这里就不过多分析；我们重点放在前三个字段上。

### `service`

`service`字段通常是应用程序的名称，例如`login`，`su`等；通过`service`字段可以区分当前规则用于哪个应用程序。即`login`程序进行身份验证时，只会根据service为login的规则进行。

### `type`

该字段用于标识规则对应的组；pam规则共有四个组，分别为：`account`、`auth`、`password`和`session`。

- `account`

  这个类型的规则用于账户管理（不校验身份），例如根据时间来限制哪些用户可以登录，哪些用户不能登录。

- `auth`
  
  `auth`是我们最常见的规则类型，用于配置用户身份校验方式；比如我们可以将用户配置成简单的密码校验，也可以配置成多因素校验。

- `password`

  这个模块类型用于更新用户的登录标识，如密码等。

- `session`

  `session`类型用在用户登录之前或之后进行一些操作，例如在某个用户登录之后，挂载某个目录，或者在用户登录之前清除它的`selinux`标签。

注意，上面四种类型，他们的功能都不是绝对的；`type`字段最重要的功能是告诉当前规则中的`pam`模块去调用某些特定类型的函数；以`pam_unix.so`模块为例，如果存在如下两条规则：

``` conf
login session required pam_unix.so open
login auth required pam_unix.so
```

在`type`为`session`的规则中，PAM框架会调用`pam_unix.so`模块中的`pam_sm_open_session()`方法；而在`auth`类型的规则中，则会调用`pam_sm_authenticate()`方法。

### `control`

该字段表示当PAM模块未能成功完成校验任务时的行为；该字段有两种表示方法，简单写法共有6个值，复杂写法是方括号中加上键值对表示。

在简单写法中，`control`字段可以取以下值：`required`、`requisite`、`sufficient`、`optional`、`include`和`substack`。

- `required`

  当前模块校验失败，整个PAM校验过程最终会返回失败，但是后续模块仍然会被调用。

- `requisite`

  当前模块校验失败将直接返回上级应用，不会继续调用后续模块。

- `sufficient`

  如果当前模块返回success，并且此模块之前的required模块没有返回失败，PAM会直接向上层应用返回成功，不继续调用后续模块；如果当前模块返回失败，PAM会继续调用后续模块，对最终结果没有影响。

- `optional`

  仅在当前的`service` `type`只有这一个模块时，这个模块返回成功或者失败才有意义。

- `include`

  将指定配置文件中的所有给定type的行包含到当前配置中.

- `substack`

  功能上与`include`相同，不同的是`substack`会创建一个子栈；子栈作为一个单独的模块执行，子栈中的`done`和`die`动作不会影响父栈，子栈中的跳转也不会跳转到父栈中；`reset`动作会初始化子栈。

`control`字段的复杂表示语法为：

``` conf
[value1=action1 value2=action2 ...]
```

这里的`valueN`对应这条规则中，调用的`pam`模块相应函数的返回值，取值范围为：

``` conf
success, open_err, symbol_err, service_err, system_err, buf_err, perm_denied, auth_err, cred_insufficient, authinfo_unavail, user_unknown, maxtries, new_authtok_reqd, acct_expired, session_err, cred_unavail, cred_expired, cred_err, no_module_data, conv_err, authtok_err, authtok_recover_err, authtok_lock_busy, authtok_disable_aging, try_again, ignore, abort, authtok_expired, module_unknown, bad_item, conv_again, incomplete, default
```

这些值定义在头文件`_pam_types.h`中。

`actionN`表示当函数返回`valueN`时，相应的动作，可以取以下值：`ignore`、`bad`、`die`、`ok`、`done`、无符号整数和`reset`。

- `ignore`

  模块的返回状态不会影响最终返回值。

- `bad`

  该动作应用于返回失败的时候；如果这个模块是整个栈中第一个失败的模块，那么这个模块的返回值就是整个栈的最终返回值。

- `die`

  功能上与b`ad`一致，但是`die`动作将终止当前栈，即不再执行后续的规则，直接返回。

- `ok`

  如果在此动作之前，栈的返回状态为`PAM_SUCCESS`，那么此动作对应的`value`将覆盖当前栈状态；如果之前的状态为`failed`，此动作对应的`value`就不会覆盖栈状态。

- done

  功能上与ok相同，但是会终止当前栈，不再执行后续的规则，直接返回。

- `N`（正整数）

  向下跳过N条规则，注意不能为0.

- `reset`

  清除当前栈的所有状态，重新开始下一条规则。

其实简单写法就是复杂写法的一种缩写，简单写法的规则同样也可以用复杂写法表示，他们之间存在以下等式：

``` conf
required    =   [success=ok new_authtok_reqd=ok ignore=ignore default=bad]
requisite   =   [success=ok new_authtok_reqd=ok ignore=ignore default=die]
sufficient  =   [success=done new_authtok_reqd=done default=ignore]
optional    =   [success=ok new_authtok_reqd=ok default=ignore]
```

## `/etc/pam.d` 目录中的配置文件

`pam.d`目录中的配置文件语法与`pam.conf`的略微不同；区别在于其只有四个字段

``` conf
type control module-path module-argument
```

对应字段的取值范围和规则仍然与`pam.conf`相同；这里缺少的`service`字段体现在文件名上，即配置文件的文件名规则，与`service`相同。
