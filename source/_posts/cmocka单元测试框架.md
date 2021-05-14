---
title: cmocka单元测试框架
date: 2019-11-07
categories: 
- 单元测试
---

`cmocka`是一个C语言的单元测试框架，仅依赖标准库，可以在多种平台多种编译器上使用。

`cmocka`官网为[https://cmocka.org/](https://cmocka.org/)

## 下载和编译

`cmocka`的源码托管在[GitLab](https://gitlab.com/cmocka/cmocka)上，编译系统使用`CMake`

```bash
git clone https://gitlab.com/cmocka/cmocka.git
cd cmocka
mkdir build && cd build
cmake .. && make
```

## 示例

`cmocka`使用示例位于源码目录下的`example`文件夹中，`example`中演示了`assert_macro`、`assert_module`、`allocate_module`和`mock`的使用。

### 测试用法

1. `simple_test`

   `simple_test.c`演示了`cmocka`最简单的使用方法。

   ```c
   #include <stdarg.h>
   #include <stddef.h>
   #include <setjmp.h>
   #include <stdint.h>
   #include <cmocka.h>		// include cmocka header

   // test case, do nothing
   static void null_test_success(void **state) {
       (void) state; /* unused */
   }

   int main(void) {
       const struct CMUnitTest tests[] = {
           cmocka_unit_test(null_test_success),
       };

       return cmocka_run_group_tests(tests, NULL, NULL);
   }
   ```

2. `allocate_module_test`

   该例子演示了`allocate`检测功能的使用， 对应的源码为`example/allocate_module.c`和`example/allocate_module_test.c`，其中`allocate_module.c`是待测试模块。

   根据源码分析，为了使用`memory check`功能，需要修改待测模块的源码

   ```c
   #ifdef UNIT_TESTING
   extern void* _test_malloc(const size_t size, const char* file, const int line);
   extern void* _test_calloc(const size_t number_of_elements, const size_t size,
                             const char* file, const int line);
   extern void _test_free(void* const ptr, const char* file, const int line);

   #define malloc(size) _test_malloc(size, __FILE__, __LINE__)
   #define calloc(num, size) _test_calloc(num, size, __FILE__, __LINE__)
   #define free(ptr) _test_free(ptr, __FILE__, __LINE__)
   #endif // UNIT_TESTING
   ```

   将代码中使用的`malloc`、`free`等函数替换成`cmocka`框架中的封装，然后在`test case`中调用待测函数

   ```c
   static void leak_memory_test(void **state) {
       (void) state; /* unused */
       leak_memory();
   }
   ```

   示例程序中演示了检测内存泄漏、缓冲区溢出和缓冲区下溢；内存问题的检测通过替换`malloc`和`free`函数来完成，使用场景比较有限。

3. `assert_macro_test`

   该示例演示了断言宏的使用，用法非常简单，在`test case`中使用断言宏对待测试模块进行调用即可

   ```c
   static void get_status_code_string_test(void **state) {
       (void) state; /* unused */
       assert_string_equal(get_status_code_string(0), "Address not found");
       assert_string_equal(get_status_code_string(1), "Connection timed out");
   }

   static void string_to_status_code_test(void **state) {
       (void) state; /* unused */
       assert_int_equal(string_to_status_code("Address not found"), 0);
       assert_int_equal(string_to_status_code("Connection timed out"), 1);
   }
   ```

   这些断言宏仅判断测试结果是否与预期相同。

4. `assert_module_test`

   在这个例子中演示了`assert`相关宏的更高级的用法：

   - `mock_assert`

     在`example/assert_module.c`中，使用`mock_assert`宏覆盖了标准库中的`assert`宏，原因是标准库中的`assert`宏会引起进程的`Aborted`，造成无法继续执行其他`test case`，而`mock_assert`不会引起进程`Aborted`。

   - `expect_assert_failure`

     根据语义可以判断这个宏的作用是***期望断言失败***，即使用该宏测试的函数中发生断言失败，则该宏测试通过，否则测试失败。

     ```c
     // 待测试函数
     void increment_value(int * const value) {
         assert(value);
         (*value) ++;
     }

     void decrement_value(int * const value) {
         if (value) {
           (*value) --;
         }
     }

     // test case
     static void increment_value_assert(void **state) {
         (void) state;
         expect_assert_failure(increment_value(NULL));
     }

     static void decrement_value_fail(void **state) {
         (void) state;
         expect_assert_failure(decrement_value(NULL));
     }

     // 测试结果
     [ RUN      ] increment_value_assert
     Expected assertion value occurred
     [       OK ] increment_value_assert
     [ RUN      ] decrement_value_fail
     Expected assert in decrement_value(NULL)
     [  ERROR   ] --- [   LINE   ] --- /home/noah/cmocka/example/assert_module_test.c:46: error: Failure!
     [  FAILED  ] decrement_value_fail
     ```

### `mock`用法

`mock`功能的演示代码位于`example/mock`中，提供了两个示例，分别是`chef_wrap`和`uptime`。

`mock`功能的使用依赖于一个连接器参数：`--wrap=symbol`，如果在编译时使用，需要用`-Wl,--wrap=symbol`，使用这个参数后，当需要调用`symbol`函数时，实际上会去调用`__wrap_symbol`。

- `chef_wrap`

  在这个例子中，待测模块是位于`waiter_test_wrap.c`中的`waiter_process`函数，该函数中使用了`chef_cook`函数，但是根据`chef.c`中`chef_cook`函数的表述，该函数并未实现，所以需要对这个函数进行`mock`，`__wrap_chef_cook`便是该函数的`mock`。

  ```c
  int __wrap_chef_cook(const char *order, char **dish_out)
  {
      bool has_ingredients;
      bool knows_dish;
      char *dish;

      check_expected_ptr(order);				// 测试输入是否为期望值

      knows_dish = mock_type(bool);			// mock knows_dish
      if (knows_dish == false) {
          return -1;
      }

      has_ingredients = mock_type(bool);		// mock has_ingredients
      if (has_ingredients == false) {
          return -2;
      }

      dish = mock_ptr_type(char *);			// mock dish
      *dish_out = strdup(dish);
      if (*dish_out == NULL) return ENOMEM;

      return mock_type(int);					// mock return value
  }
  ```

  该`mock`函数的实现中，有四处`mock_type`，这些变量的值由外部（如`test case`中）提供；`check_expected_ptr`宏用来测试变量是否为期望的值，该期望值也由外部指定。

  ```c
  static void test_order_hotdog(void **state)
  {
      int rv;
      char *dish;
      (void) state; /* unused */

      /* 指定check_expected_ptr的期望值 */
      expect_string(__wrap_chef_cook, order, "hotdog");

      will_return(__wrap_chef_cook, true);	// mock knows_dish
      will_return(__wrap_chef_cook, true);	// mock has_ingredients
      /* mock dish */
      will_return(__wrap_chef_cook, cast_ptr_to_largest_integral_type("hotdog"));
      will_return(__wrap_chef_cook, 0);		// mock return value

      rv = waiter_process("hotdog", &dish);

      assert_int_equal(rv, 0);
      assert_string_equal(dish, "hotdog");
      if (dish != NULL) {
          free(dish);
      }
  }
  ```

- `uptime`

  该示例中编译后生成两个可执行文件，分别是`uptime`和`test_uptime`；其中`uptime`使用未被`mock`的`uptime`函数，而`test_uptime`使用`mock`的`uptime`函数。

  这个例子旨在演示`mock`函数的用途，以及开发过程中`mock`在进行单元测试时的作用。

## 生成测试报告

`cmocka`生成的`xml`格式报告为`JUnit`格式。

一般情况下，执行`cmocka`单元测试程序，测试结果会直接打印到`stderr`上，格式如下

```
[==========] Running 2 test(s).
[ RUN      ] test_order_hotdog
[       OK ] test_order_hotdog
[ RUN      ] test_bad_dish
[       OK ] test_bad_dish
[==========] 2 test(s) run.
[  PASSED  ] 2 test(s).
```

如果需要生成`xml`格式报告，需要在代码中添加如下行

```c
cmocka_set_message_output(CM_OUTPUT_XML);
```

该行需要在`cmocka_run_group_tests`之前调用；`xml`格式输出如下

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<testsuites>
  <testsuite name="tests" time="0.000" tests="2" failures="0" errors="0" skipped="0" >
    <testcase name="test_order_hotdog" time="0.000" >
    </testcase>
    <testcase name="test_bad_dish" time="0.000" >
    </testcase>
  </testsuite>
</testsuites>
```

除此之外，也可以通过设置`CMOCKA_MESSAGE_OUTPUT`环境变量修改`cmocka`的输出格式，环境变量可用的值有`stdout`、`subunit`、`tab`和 `xml`；需要注意的是，设置环境变量修改报告格式的方法优先级更高。

默认情况下，`cmocka`的输出会被打印到`stderr`，如果需要存储到文件中，可以通过设置`CMOCKA_XML_FILE`环境变量的方式，如

```bash
CMOCKA_XML_FILE=testresults/result1.xml
```

如果`cmocka`无法在`CMOCKA_XML_FILE`指定的位置创建文件，则仍然会将结果输出到`stderr`。

如果有多个`cmocka`测试程序需要生成报告，可以使用`%g`对文件名进行格式化

```bash
CMOCKA_XML_FILE=testresults/%g.xml
```

生成报告时，`%g`将被格式化为`group name`，即`cmocka_run_group_tests`宏的第一个参数，例如前面`simple_test`生成的报告文件名为`tests.xml`。

## 生成覆盖率报告

推荐使用`lcov`工具生成代码覆盖率报告；`lcov`依赖于`gcov`，后者是包含在`GNU`编译套件中的，只要安装了`GCC`，一般就已经包含了`gcov`工具，但是`lcov`需要单独安装；`Ubuntu`上安装方法如下

```bash
sudo apt install lcov
```

为了生成代码覆盖率报告，首先需要在编译生成单元测试程序时，添加编译器和连接器参数

```bash
# 编译器参数
--coverage

# 连接器参数
--coverage -lgcov

# 通过GCC添加连接器参数
-Wl,--coverage -lgcov
```

编译完成后，可执行文件同级目录下应该会生成后缀名为`.gcno`的文件，如果使用`cmake`编译系统进行编译，生成的文件可能在对应项目的`CMakeFiles`目录中；继续执行测试程序，执行完成后，会在当前目录生成后缀名为`.gcda`的文件，如果使用`cmake`，则会生成在`CMakeFiles`对应的目录中。

接着使用`lcov`分析并生成对应的`info`文件

```bash
lcov --capture --directory project-dir --output-file coverage.info
```

注意将`project-dir`替换成包含`.gcda`文件的文件夹（支持递归查找）

最后使用`genhtml`工具将前面生成的`info`文件转为`html`格式的网页

```bash
genhtml coverage.info --output-directory out
```

生成的静态网页会存放在`out`文件夹中，使用浏览器打开`index.html`即可可视化查看代码覆盖率

![代码覆盖率](https://i.loli.net/2019/10/09/6UgIfKmhFuj14lk.png)

![覆盖的行](https://i.loli.net/2019/10/09/jbSNAeZTfusnCKg.png)