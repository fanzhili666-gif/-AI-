# IrisView AI 巡检助手验收说明

## 一键验收

在项目根目录执行：

```bash
./pre_submit_check.sh
```

脚本会依次执行：

1. 全部 Node.js 单元测试；
2. JavaScript 语法检查；
3. Git 补丁格式检查；
4. IrisView Build；
5. IrisView Package；
6. IrisView Verify。

如需使用其他 Developer Kit 路径：

```bash
IRISVIEW_BIN=/path/to/irisview ./pre_submit_check.sh
```

## 自动化闭环

端到端测试位于 [tests/e2e-domain-flow.test.js](./tests/e2e-domain-flow.test.js)，覆盖：

```text
创建行动项
→ 上下文合并
→ 生成确认提案
→ 确认执行
→ 多行动项歧义拦截
→ 取消变更
→ 旧命令作废
```

## 手工验收

先运行 `./pre_submit_check.sh` 生成应用包，再执行：

```bash
./run.sh
```

需要在项目根目录创建 `.env.local`，内容为：

```env
DASHSCOPE_API_KEY=你的新密钥
```

不要把真实密钥写入 Git、截图、日志或验收文档。

建议依次输入或说出：

```text
三号泵压力偏高，安排李娜今天复查
截止时间改成明天上午
总结一下当前工单
负责人不是李娜，是王强
确认
取消
```

重点观察：

- 连续追问不丢失设备和现象；
- 多行动项无法唯一定位时要求指定目标；
- 需要确认的变更不会直接落地；
- 确认后才更新行动项；
- 取消后原数据保持不变；
- 日志包含 `domain_version`、`context_changes` 和确认结果。
