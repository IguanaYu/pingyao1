# 演示版资产说明

本批从现有城隍庙场景 v03 提取主轴院落，保留蓝袍发髻小人外形，给小人增加可在 Cocos 中驱动的分件枢轴。原模型及原 Blender 文件未修改。

## 运行时资源

- `../client/assets/resources/models/temple/temple.gltf` 与 `temple.bin`：22 个建筑／器物模块，508,609 三角面，glTF 场景名 `Temple`。包含牌坊、山门、戏楼、钟鼓亭、中院、献殿、城隍正殿及侧廊背景；省略东西侧院和后院细节。2026-11-19 起正殿主像换为 A 风格样间 v03 简化圆脸神像（253,402 面，见下方替换记录），其余模块不变。
- `../client/assets/resources/models/visitor/visitor.gltf` 与 `visitor.bin`：原小人 28 个网格、9,482 三角面，glTF 场景名 `Visitor`。外形和纯色材质沿用原资产，新增空节点层级用于动作。
- `../shared/scene.json`：客户端和服务端共用的演示范围、地面、高台、坡面、44 个简化障碍、互动站位及物件放置位置。

资源采用米制，Y 向上、北向 -Z；小人在 yaw=0 时面向 +Z。glTF 和同目录 `.bin` 必须一起保留。除主像外源材质均为颜色材质；主像衣料纹样为程序化贴图，导出为同目录 5 张 `V2_BODY_*.png`，随 glTF 一起引用，无在线资源依赖。

演示路线在献殿后沿增加一段运行时生成的五级窄石阶，将 z=-15.45、y=.94 的台面连续接到原正殿台阶 z=-16.30、y=.51 处。共用场景数据的 `xiandian-rear-connector` 描述连续可走坡面，`connectionSteps` 描述五块同色可见石阶；客户端和服务器高度均取覆盖表面的最大值。这是为演示通行补充的游戏适配，不修改原建筑模型，也不作为实物测绘结构。

## 小人动画接口

完整层级和静止位置见 `visitor_rig.json`。Cocos 运行时按节点名寻找并插值角度即可，不依赖骨骼插件。

| 节点 | 局部静止位置 | 用途 |
|---|---|---|
| `Torso` | (0, .46, 0) | 躬身和坐姿的上身高度 |
| `Arm_L` / `Arm_R` | (-/+.14, .16, 0)，父为 Torso | 抬臂、持香、托物 |
| `HandSocket_L` / `HandSocket_R` | (-/+.085, -.235, .014)，父为对应手臂 | 将香束或小物件附到掌部 |
| `HeadPivot` | (0, .233, 0)，父为 Torso | 点头或轻微转头 |
| `Leg_L` / `Leg_R` | (-/+.073, .30, 0)，父为 VisitorRig | 行走摆腿、坐下向前伸腿 |
| `RobePivot` | (0, 0, 0)，父为 Torso | 坐姿适度缩短衣摆，避免穿过坐垫 |

glTF/Cocos 下抬臂使用负 X 角度；上身前倾使用正 X 角度。建议角度在 `visitor_rig.json` 中，实际游戏动作由客户端脚本随时间插值，并结合手持物调整。

## 可编辑来源与预览

- `temple_demo.blend`、`visitor_demo.blend` 是本批导出对应的可编辑源文件，`EXPORT` 集合仅包含资源本体。
- `prepare_assets.py` 可用 Blender 4.2 重新导出；依赖工作区原始 `城隍庙场景_v03/模型` 两个 GLB。
- 随交付包独立重建资源时使用 `export_blends.py`：它只读取同目录的 `temple_demo.blend`、`visitor_demo.blend`，导出各自 `EXPORT` 集合到客户端资源目录，不需要原工作区。命令为 `blender --background --python asset-work/export_blends.py`。导出后重新构建 Cocos 网页。
- `preview_poses.py` 仅渲染建议姿态，不改运行时资产。
- `previews/` 包含院落构图、小人正侧背面及持物、礼敬、坐姿的真实模型渲染。
- `asset-report.json` 记录模块和三角面数量。

已检查 glTF 导出、外部二进制文件和 Blender 预览。Cocos 导入、运行光照和动作观感以客户端演示检查为准。本批未做几十人手机性能认证。

## 主像替换记录（2026-11-19）

- 来源：`../A风格样间_v03_简化脸部/源文件/statue_editable.blend` 的 `STATUE_EDITABLE` 集合（身体+官帽合并件与简化圆脸分件，共 253,402 三角面）。源文件只读未改。
- 流程：`replace_statue.py`（Blender 4.2 无头运行）打开 `temple_demo.blend`，删除旧 `Statue_Chenghuang`（2,559 面），追加上述集合并合并为同名对象，等比缩放 0.835318 对齐旧像脚底（y=.94）、背板（z 旧像深度方向同平面）与总高（0.94→3.2228），保留朝向（面向殿门）。之后照常跑 `export_blends.py` 重导出、重建 Cocos 网页。
- 客户端联动：`client/assets/scripts/TempleDemo.ts` 的 `CUTE_HEADS` 移除了主像位置的运行时萌化头（新像自带圆脸五官），其余配像萌化头与 `HIDE_MATS` 逻辑不变（`V2_*`/`V3_FACE_*` 材质不受其影响）。
- 对位与网格数据存于 `statue-swap.json`；渲染目检见 `previews/statue_v03_front.png`、`previews/statue_v03_threequarter.png`。运行时核验（无头 Chrome 软件渲染）：主像节点在 (0, .94, -23.06)、20 个子网格、礼敬自动寻路与行礼正常、无页面报错，记录与截图在 `../checks/statue-swap-report.json`、`../checks/12-新主像礼敬.png`、`../checks/13-新主像近景.png`。
- 回滚：将 `temple_demo.blend.bak-pre-v03` 复制回 `temple_demo.blend`，恢复 `TempleDemo.ts` 主像萌化头条目，重跑 `export_blends.py` 与网页构建即可。
- 注意：整场景三角面由 257,766 增至 508,609，主像为唯一高模件。无头 Chrome 软件渲染实测约 8.5 fps 仅供参考；真实手机与微信环境的加载时间和帧率尚未实测，如现场设备吃紧，下一步可对主像单独减面。
