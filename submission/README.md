# 智丽 AI 助手竞赛提交材料

此目录用于汇总提交说明、验收记录和证据索引，不属于应用运行资源；应用包只从项目配置和 `src/` 构建。

## 当前文件

- `PROJECT-OVERVIEW.md`：两页作品说明的内容底稿；最终 PDF 需与实测证据和冻结版本一致。
- `PROJECT-OVERVIEW.html`：可打印的作品说明源稿；如修改，需重新导出 PDF。
- `作品简介.pdf`：两页 PDF；按参赛者要求保留当前版本，导出后说明源稿仍有后续文字修订。
- `模拟器演示视频-智丽AI助手-范智丽.mp4`：模拟器演示视频，时长 113.453 秒（低于 120 秒上限）。
- `ACCEPTANCE-RESULTS.csv`：8 项手工验收记录表。
- `LATENCY-10-RUNS.csv`：10 次连续延迟测量表。
- `EVIDENCE-INDEX.md`：截图、录屏和日志的编号索引。
- `DECLARATIONS.md`：数据、素材、代码及 AI 使用声明草稿。

## 候选应用版本

- 产品名：智丽 AI 助手 / ZhiLi AI Assistant
- 应用 ID：`example.myfirstapp`
- 应用版本：`1.0.0`，版本码 `119`
- 候选包：`../my-first-app.fuiapp`
- SHA-256：`065ec65ea93026d8349d6e6dcf1ccf5476ec98bda6492b6c7aa7215a3a8c1942`
- 大小：555,409 bytes
- 构建类型：debug-unsigned；确认赛事模拟器接受该签名模式后再冻结。

已通过 `./pre_submit_check.sh` 构建和验证。T01–T08 均已通过，十次延迟测量也已完成。T05 的重启后复查由参赛者确认，截图未单独呈现重启过程。T07 的待确认和异常状态由参赛者确认观察到，异常后继续请求成功并恢复；仅采集到其余三种状态的截图。若后续修改源码或配置，先递增 `FusionUIApp.json` 的 `versionCode`，重新运行检查，再更新本页版本号和哈希，并重测受影响用例。
