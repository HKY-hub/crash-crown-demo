# HKY · 游戏策划作品集

线上作品集：<https://HKY-hub.github.io/crash-crown-demo/>

首页按“原创游戏 / 商业研究 / 应用系统”三类组织，展示三款原创游戏（《撞击王座》《Wave Rider》《生化追击》）、CS2 系统研究、两套应用系统；策划文档与实机记录集中在“文档”一节。联系方式指向公开 GitHub 主页；页面不包含私人邮箱。

- [《撞击王座》游戏客户端](game/client.html) · [系统策划案 / 系统拆解案](docs/)
- [Wave Rider 游戏客户端](wave-rider/) · [版本选择](wave-rider/versions.html)
- [生化追击 · 横版](biohazard/)：网页版
- [CS2 系统拆解案](cs2/)
- [配置与预算工作簿](spreadsheets/)
- [教学视频转写前端演示](demo/teaching-video/)：本地模拟数据，可体验上传、编辑、历史与导出
- [电力风险辨识前端演示](demo/electric-safety/dashboard.html?module=home)：本地模拟 API / AI / 检测
- [教学视频语音文本提取系统源码](https://github.com/HKY-hub/teaching-video-transcription)
- [电力作业风险辨识与安全交底系统源码](https://github.com/HKY-hub/ELeDangerCheck)

《撞击王座》和 Wave Rider 共用一套游戏客户端外壳：启动页、本地登录、大厅、仓库、生涯、设置与新手引导；“开始对局”会载入真实游戏并自动进入比赛。昵称、等级、装备与任务进度只保存在当前浏览器的 localStorage，不连接账号服务，也不构成线上账号系统。客户端外壳已做移动端布局，但两款游戏本体的键盘/触控操作仍以实际版本为准。

生化追击网页版单人与训练营可直接玩，联机房需要本地 Node 服务；Godot 桌面成品不通过 GitHub Pages 分发。两套应用的前端演示使用本地模拟数据，不连接后端；真实转写/检测/登录服务需 Docker、Whisper、MySQL 与 ONNX 等环境，源码和部署说明保存在独立仓库。各仓库说明具体验证范围。

此仓库保存公开成品，不含《撞击王座》完整工程、美术源或账号服务。原创内容版权与第三方素材来源见 [版权说明](credits.html)；CS2 内容为研究资料，不表示参与原游戏制作。Wave Rider 与生化追击中的第三方音效、字体与素材，其许可与来源以各自项目内的说明为准。
