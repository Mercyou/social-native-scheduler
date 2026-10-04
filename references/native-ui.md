# 网页操作要点

以下是 2026-10-04 实际网页操作的经验，定位与额度可能变化。先读取当前页面再使用。

## OpenCLI

官方项目：https://github.com/jackwener/OpenCLI

官方 Chrome 扩展：https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk

扩展正式名称是 OpenCLI。同名 Browser Bridge 插件不一定兼容。用 `opencli doctor` 和 `opencli profile list` 核实连接；多配置时指定实际选定的 `--profile`，不要保存示例配置编号。

`opencli twitter post`、`opencli weibo publish` 是立即发送命令，不能用于原生定时。原生定时需操作网页编辑器。不要把已登录会话交给 GitHub Actions：它无法直接复用用户电脑里的登录浏览器。

调用方式以安装版本 `--help` 为准。已有支持面包括：

```text
opencli --profile <已确认配置> browser <会话> open <网址>
opencli --profile <已确认配置> browser <会话> state
opencli --profile <已确认配置> browser <会话> fill <当前定位> <完整正文>
opencli --profile <已确认配置> browser <会话> click <当前定位>
```

动态正文通过结构化参数传递，避免构造包含正文的 shell 命令。`--testid` 可能按包含关系匹配，`tweetTextarea_0` 还会匹配 label 和 container。使用当前状态中的引用，或明确作用域及精确 CSS；弹窗编辑框可能与首页编辑框同时存在。

## X

首页 https://x.com/home ，待发布列表 https://x.com/compose/post/unsent/scheduled 。先从页面可见入口进入并确认账号。

常见控件：

- 发帖入口 `SideNav_NewTweet_Button`。
- 文本框 `tweetTextarea_0`，通常需要限制在当前 `role=dialog` 内。
- 日历按钮 `scheduleOption`。
- 日期选择器由 Month、Day、Year、Hour、Minute、AM/PM 标签关联。不要依赖 SELECTOR 编号恒定；读取实际 label 和关联 select。
- 日期确认按钮 `scheduledConfirmationPrimaryAction`。
- 最终按钮通常仍叫 `tweetButton`，但可见文字应为 Schedule，而非 Post。定时指示 `scheduledTweetIndicator` 应与期望日期对应。
- 列表条目 `unsentTweet` 包含正文及 “Will send on …” 时间。

China Standard Time 为北京时间，12小时制需要核对 AM/PM。跨午夜同时变更日期，不能只把小时改成0。

直接导航 compose 页面曾被拒绝；从首页可见发帖入口进入可以成功。部分页面加载未完成时按钮虽在 DOM 中但不响应，或日期弹窗只有空白与 Scheduled posts。先读取状态、等待正常加载，必要时重新打开干净的页面。结果不明时先检查服务器列表；不要重复点提交。

## 微博

首页 https://weibo.com ，管理入口 https://me.weibo.com/content/timer 。创作者中心可能通过 iframe 显示待发布列表，读取当前 iframe 地址或使用支持的 frame 接口。

首页“发微博” → 当前编辑器中的“定时微博”，或待发布列表“发布定时微博”。编辑器可能有两个 textarea，确认当前弹窗中的可见文本框。

常见日期控件是一个日期 input，加两个 `.multiselect`（小时、分钟）。原生选项点击实际 `.multiselect__option`；只点外层 li 可能不触发选中。选项由当前日期、当前小时限制，先选小时再读取分钟选项。核验 `.multiselect__single` 显示选定值，再点击当前编辑器内的“发送”。不要误点列表“立即发送”。

列表带“发布时间”，核对日期和时间。列表可能一次只渲染5条，需要继续滚动到最底部并核验其余记录。

官方规则（执行时重新核实）：https://kefu.weibo.com/faqdetail?id=16085 。2026-10-04 页面曾显示 VIP 4条、SVIP 12条、VVIP不限条数；同一官方页面还含旧的20条描述，因此实际剩余额度和提交结果优先。不要按历史数字承诺可以完成。
