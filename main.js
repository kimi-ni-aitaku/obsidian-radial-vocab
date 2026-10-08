const { Plugin, ItemView } = require("obsidian");

const VIEW_TYPE_RADIAL = "radial-vocab-view";

// Catppuccin 优雅配色体系 (https://github.com/catppuccin/catppuccin)
const MODULE_PALETTES = [
    { name: "Teal",      stroke: "#179299", bg: "rgba(23, 146, 153, 0.05)",  text: "#179299" }, // 四季/主干清新色
    { name: "Sapphire",  stroke: "#209fb5", bg: "rgba(32, 159, 181, 0.05)",  text: "#209fb5" }, // 宝石蓝
    { name: "Mauve",     stroke: "#8839ef", bg: "rgba(136, 57, 239, 0.05)",  text: "#8839ef" }, // 经典淡紫
    { name: "Peach",     stroke: "#fe640b", bg: "rgba(254, 100, 11, 0.05)",  text: "#fe640b" }, // 温暖蜜桃
    { name: "Green",     stroke: "#40a02b", bg: "rgba(64, 160, 43, 0.05)",   text: "#40a02b" }, // 草本绿
    { name: "Maroon",    stroke: "#e64553", bg: "rgba(230, 69, 83, 0.05)",   text: "#e64553" }, // 勃艮第栗色
    { name: "Pink",      stroke: "#ea76cb", bg: "rgba(234, 118, 203, 0.05)", text: "#ea76cb" }, // 柔和粉
    { name: "Blue",      stroke: "#1e66f5", bg: "rgba(30, 102, 245, 0.05)",  text: "#1e66f5" }, // 晴空蓝
    { name: "Lavender",  stroke: "#7287fd", bg: "rgba(114, 135, 253, 0.05)", text: "#7287fd" }, // 薰衣草紫
    { name: "Flamingo",  stroke: "#dd7878", bg: "rgba(221, 120, 120, 0.05)", text: "#dd7878" }  // 火烈鸟色
];

const AFFIX_PALETTES = [
    { name: "mauve",     stroke: "#8839ef", bg: "rgba(136, 57, 239, 0.12)", text: "#8839ef" },
    { name: "sapphire",  stroke: "#209fb5", bg: "rgba(32, 159, 181, 0.12)", text: "#209fb5" },
    { name: "maroon",    stroke: "#e64553", bg: "rgba(230, 69, 83, 0.12)",  text: "#e64553" },
    { name: "peach",     stroke: "#fe640b", bg: "rgba(254, 100, 11, 0.12)",  text: "#fe640b" },
    { name: "teal",      stroke: "#179299", bg: "rgba(23, 146, 153, 0.12)", text: "#179299" },
    { name: "pink",      stroke: "#ea76cb", bg: "rgba(234, 118, 203, 0.12)", text: "#ea76cb" },
    { name: "green",     stroke: "#40a02b", bg: "rgba(64, 160, 43, 0.12)",  text: "#40a02b" },
    { name: "lavender",  stroke: "#7287fd", bg: "rgba(114, 135, 253, 0.12)", text: "#7287fd" },
    { name: "yellow",    stroke: "#df8e1d", bg: "rgba(223, 142, 29, 0.12)",  text: "#df8e1d" },
    { name: "flamingo",  stroke: "#dd7878", bg: "rgba(221, 120, 120, 0.12)", text: "#dd7878" }
];

class RadialVocabView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_RADIAL;
    }

    getDisplayText() {
        return "360° 单词导图";
    }

    getIcon() {
        return "network";
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.addClass("radial-vocab-view-container");
        await this.refresh();
    }

    async refresh(specifiedFile = null) {
        let file = specifiedFile;
        if (!file || !file.path) {
            file = this.plugin.getActiveMarkdownFile();
        }

        if (!file || file.extension !== "md") {
            this.renderEmpty("请在左侧打开任意一篇单词 Markdown 笔记");
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const model = this.plugin.parseMarkdownDocument(content, file.basename);

            if (!model || !model.children || model.children.length === 0) {
                this.renderEmpty(`《${file.basename}》中暂未识别到层级大纲或关联词汇`);
                return;
            }

            this.contentEl.empty();

            // 极简全画幅纯净白板渲染
            const graphContainer = this.contentEl.createDiv({ cls: "radial-view-graph-body" });
            this.plugin.mountInteractiveGraph(graphContainer, model, file.path);
        } catch (e) {
            console.error("渲染 360 导图失败:", e);
            this.renderEmpty("渲染失败: " + e.message);
        }
    }

    renderEmpty(msg) {
        this.contentEl.empty();
        const emptyEl = this.contentEl.createDiv({ cls: "radial-empty-state" });
        emptyEl.innerHTML = `
            <div style="font-size:28px; margin-bottom:10px; opacity:0.8;">🌐</div>
            <div style="color:var(--text-muted); font-size:13px; text-align:center;">${msg}</div>
        `;
    }

    async onClose() {
        if (this.contentEl && this.contentEl._radialCleanup) {
            this.contentEl._radialCleanup();
        }
    }
}

class RadialVocabPlugin extends Plugin {
    async onload() {
        console.log("Radial Vocab Plugin 启动完成");

        this.savedPositions = (await this.loadData()) || {};
        this.debounceTimer = null;
        this.affixColorMap = new Map();
        this.nextAffixColorIdx = 0;

        // 1. 注册专属独立视图
        this.registerView(VIEW_TYPE_RADIAL, (leaf) => new RadialVocabView(leaf, this));

        // 2. 左侧 Ribbon 栏添加图标按钮
        this.addRibbonIcon("network", "打开 360° 单词星系导图视图", () => {
            this.activateView();
        });

        // 3. 注册快捷命令
        this.addCommand({
            id: "open-radial-vocab-view",
            name: "打开 360° 单词星系导图视图",
            callback: () => this.activateView()
        });

        // 4. 支持 Markdown 内置 ```radial 代码块（兼容模式）
        this.registerMarkdownCodeBlockProcessor("radial", async (source, el, ctx) => {
            let textToParse = source.trim();
            let targetFile = null;

            if (ctx && ctx.sourcePath) {
                targetFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
                if (!targetFile) {
                    targetFile = this.app.metadataCache.getFirstLinkpathDest(ctx.sourcePath, "");
                }
            }
            if (!targetFile) {
                targetFile = this.getActiveMarkdownFile();
            }

            if (!textToParse && targetFile) {
                try {
                    const content = await this.app.vault.read(targetFile);
                    const model = this.parseMarkdownDocument(content, targetFile.basename);
                    if (model && model.children && model.children.length > 0) {
                        const container = el.createDiv({ cls: "radial-vocab-container" });
                        this.mountInteractiveGraph(container, model, targetFile.path);
                        return;
                    }
                } catch (e) {
                    console.error("解析正文失败:", e);
                }
            }

            if (textToParse) {
                const model = this.parseMarkdownDocument(textToParse, "vocab");
                if (model && model.children && model.children.length > 0) {
                    const container = el.createDiv({ cls: "radial-vocab-container" });
                    this.mountInteractiveGraph(container, model, (ctx && ctx.sourcePath) || "");
                    return;
                }
            }

            el.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12px; text-align:center;">💡 暂无组合词或词族可生成导图</div>`;
        });

        // 5. 监听文件切换事件，自动更新视图
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (file && file.extension === "md") {
                    this.updateAllViews(file);
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (leaf && leaf.view && leaf.view.getViewType() === "markdown" && leaf.view.file) {
                    this.updateAllViews(leaf.view.file);
                }
            })
        );

        // 6. 监听文件实时编辑，实时响应 Markdown 修改（防抖 350ms）
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file && file.extension === "md") {
                    const cur = this.getActiveMarkdownFile();
                    if (cur && cur.path === file.path) {
                        if (this.debounceTimer) clearTimeout(this.debounceTimer);
                        this.debounceTimer = setTimeout(() => {
                            this.updateAllViews(file);
                        }, 350);
                    }
                }
            })
        );
    }

    getActiveMarkdownFile() {
        const cur = this.app.workspace.getActiveFile();
        if (cur && cur.extension === "md") return cur;

        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
            if (leaf.view && leaf.view.file && leaf.view.file.extension === "md") {
                return leaf.view.file;
            }
        }
        return null;
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_RADIAL)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
            } else {
                leaf = workspace.getRightLeaf(true) || workspace.getLeaf(true);
            }
            await leaf.setViewState({
                type: VIEW_TYPE_RADIAL,
                active: true,
            });
        } else if (!(leaf.view instanceof RadialVocabView)) {
            await leaf.setViewState({
                type: VIEW_TYPE_RADIAL,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);
        if (leaf.view instanceof RadialVocabView) {
            await leaf.view.refresh();
        }
    }

    updateAllViews(targetFile) {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_RADIAL);
        for (const leaf of leaves) {
            if (leaf.view instanceof RadialVocabView) {
                leaf.view.refresh(targetFile);
            }
        }
    }

    async saveNodePosition(sourcePath, word, x, y) {
        if (!sourcePath || !word) return;
        if (!this.savedPositions[sourcePath]) {
            this.savedPositions[sourcePath] = {};
        }
        this.savedPositions[sourcePath][word] = { x: Math.round(x), y: Math.round(y) };
        await this.saveData(this.savedPositions);
    }

    getAffixColor(affix) {
        if (!affix) return null;
        const key = affix.toLowerCase().trim();
        if (!this.affixColorMap.has(key)) {
            const color = AFFIX_PALETTES[this.nextAffixColorIdx % AFFIX_PALETTES.length];
            this.nextAffixColorIdx++;
            this.affixColorMap.set(key, color);
        }
        return this.affixColorMap.get(key);
    }

    // 智能提取单词、中文释义及前后缀（支持公式写法与智能词缀识别）
    extractAffixAndWord(lineText, rootWord) {
        let word = "";
        let cn = "";
        let affix = null;
        let affixType = null; // 'prefix' | 'suffix'

        // 1. 用户高频公式写法：
        // [[off-]] + season → **off-season**（淡季）
        // season + [[-al]] → **seasonal**（季节性的）
        // [[help]] + [[-less]] → helpless
        // run + -er → runner (跑步者)
        const formulaMatch = lineText.match(/(?:\[\[)?([a-zA-Z\-]+)(?:\]\])?\s*\+\s*(?:\[\[)?([a-zA-Z\-]+)(?:\]\])?\s*→\s*(?:\*\*)?(?:\[\[)?([a-zA-Z\-\s]+)(?:\]\])?(?:\*\*)?(?:[（\(]([^）\)]+)[）\)])?/);
        if (formulaMatch) {
            const p1 = formulaMatch[1].trim();
            const p2 = formulaMatch[2].trim();
            word = formulaMatch[3].trim();
            cn = (formulaMatch[4] || "").trim();

            if (p1.endsWith("-") || p1.startsWith("-")) {
                affix = p1;
                affixType = p1.endsWith("-") ? "prefix" : "suffix";
            } else if (p2.endsWith("-") || p2.startsWith("-")) {
                affix = p2;
                affixType = p2.endsWith("-") ? "prefix" : "suffix";
            } else {
                if (rootWord && p1.toLowerCase() === rootWord.toLowerCase()) {
                    affix = "-" + p2;
                    affixType = "suffix";
                } else if (rootWord && p2.toLowerCase() === rootWord.toLowerCase()) {
                    affix = p1 + "-";
                    affixType = "prefix";
                }
            }
            return { word, cn, affix, affixType };
        }

        // 2. 标准箭头或列表项: - seasonal (季节性的) / - [[spring]] (春天)
        const arrowMatch = lineText.match(/→\s*(?:\*\*)?(?:\[\[)?([^\]\*\(\（]+)(?:\]\])?(?:\*\*)?(?:[（\(]([^）\)]+)[）\)])?/);
        if (arrowMatch) {
            word = arrowMatch[1].trim();
            cn = (arrowMatch[2] || "").trim();
        } else {
            const parenMatch = lineText.match(/^([^（\(]+)[（\(]([^）\)]+)[）\)]/);
            if (parenMatch) {
                word = parenMatch[1].replace(/^[-*+\[\]\*\s]+/, "").replace(/[-*+\[\]\*\s]+$/, "").trim();
                cn = parenMatch[2].trim();
            } else {
                const splitMatch = lineText.match(/^([^—:：]+)[—:：](.+)$/);
                if (splitMatch) {
                    word = splitMatch[1].replace(/^[-*+\[\]\*\s]+/, "").replace(/[-*+\[\]\*\s]+$/, "").trim();
                    cn = splitMatch[2].trim();
                } else {
                    word = lineText.replace(/^[-*+\[\]\*\s]+/, "").replace(/[-*+\[\]\*\s]+$/, "").trim();
                    cn = "";
                }
            }
        }

        // 3. 智能推断与 rootWord 的前后缀对应
        if (word && rootWord && word.toLowerCase() !== rootWord.toLowerCase()) {
            const wLower = word.toLowerCase();
            const rLower = rootWord.toLowerCase();

            // 前缀模式
            const commonPrefixes = ["un-", "in-", "im-", "dis-", "re-", "pre-", "off-", "mid-", "over-", "sub-", "inter-", "non-", "anti-"];
            for (const p of commonPrefixes) {
                const rawP = p.replace("-", "");
                if (wLower.startsWith(rawP) && (wLower.slice(rawP.length).startsWith(rLower) || wLower.includes(rLower))) {
                    affix = p;
                    affixType = "prefix";
                    break;
                }
            }

            // 后缀模式（长后缀优先）
            if (!affix) {
                const commonSuffixes = ["-al", "-ly", "-ing", "-ed", "-er", "-able", "-ible", "-ion", "-tion", "-ness", "-ment", "-ful", "-less", "-est", "-th", "-y"];
                commonSuffixes.sort((a, b) => b.length - a.length);
                for (const s of commonSuffixes) {
                    const rawS = s.replace("-", "");
                    if (wLower.endsWith(rawS) && (wLower.slice(0, -rawS.length).endsWith(rLower) || wLower.includes(rLower))) {
                        affix = s;
                        affixType = "suffix";
                        break;
                    }
                }
            }
        }

        return { word, cn, affix, affixType };
    }

    // 核心解析：标题作为中心节点，模块作为扇区分区
    parseMarkdownDocument(content, fallbackWord) {
        const lines = content.split("\n");
        let rootWord = fallbackWord;
        let rootCn = "";

        // 1. 读取 Frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
            const wMatch = fmMatch[1].match(/^word:\s*(.+)$/m);
            if (wMatch) rootWord = wMatch[1].trim();
        }

        // 2. 匹配第一个 H1 标题作为中心节点（无一级标签冗余）
        for (const line of lines) {
            const h1 = line.match(/^#\s+([^#\n]+)/);
            if (h1) {
                const m = h1[1].match(/^([a-zA-Z\-\s\u4e00-\u9fa5]+)(?:[\(\（]([^\)\）]+)[\)\）])?/);
                if (m) {
                    rootWord = m[1].trim();
                    if (m[2]) rootCn = m[2].trim();
                }
                break;
            }
            const bold = line.match(/^-\s*\*\*([^*]+)\*\*\s*(?:\[[^\]]+\])?\s*(.+)/);
            if (bold) {
                rootWord = bold[1].trim();
                const cns = bold[2].match(/[\u4e00-\u9fa5]+/g);
                if (cns && cns.length > 0) rootCn = cns.slice(0, 2).join("/");
                break;
            }
        }

        const rootNode = {
            id: "root-node",
            word: rootWord,
            cn: rootCn,
            children: [],
            modules: [],
            isRoot: true,
            level: 0
        };

        let idCounter = 1;
        const cleanBody = content.replace(/^---\n[\s\S]*?\n---/, "");

        // A. 检查是否存在 H2 模块标题（如 ## 四季更迭、## 词缀派生、## 生活与商业、## 合成词等）
        const sectionRegex = /^##\s+([^\n]+)/gm;
        let match;
        const indices = [];
        while ((match = sectionRegex.exec(cleanBody)) !== null) {
            indices.push({ title: match[1].trim(), index: match.index, length: match[0].length });
        }

        if (indices.length > 0) {
            indices.forEach((sec, sIdx) => {
                const startPos = sec.index + sec.length;
                const endPos = (sIdx + 1 < indices.length) ? indices[sIdx + 1].index : cleanBody.length;
                const secContent = cleanBody.substring(startPos, endPos);
                const moduleName = sec.title.replace(/[\(\[（].*?[\)\]）]/g, "").trim();

                const secLines = secContent.split("\n");
                const listItems = [];
                for (const line of secLines) {
                    const mList = line.match(/^(\s*)[-*+]\s+(.*)/);
                    if (mList) {
                        const indent = mList[1].replace(/\t/g, "  ").length;
                        const text = mList[2].trim();
                        if (!text.startsWith("拼：") && !text.startsWith("tags:")) {
                            listItems.push({ indent, text });
                        }
                    }
                }

                if (listItems.length > 0) {
                    const modColor = MODULE_PALETTES[sIdx % MODULE_PALETTES.length];
                    const moduleObj = {
                        id: `module-${sIdx}`,
                        name: moduleName,
                        index: sIdx,
                        color: modColor,
                        topNodes: [],
                        allNodes: []
                    };
                    rootNode.modules.push(moduleObj);

                    const tempRoot = { children: [], level: 0 };
                    const stack = [{ indent: -1, node: tempRoot }];

                    for (const item of listItems) {
                        const { word, cn, affix, affixType } = this.extractAffixAndWord(item.text, rootWord);
                        if (!word || word.toLowerCase() === rootWord.toLowerCase()) continue;

                        const affixColor = affix ? this.getAffixColor(affix) : null;

                        const node = {
                            id: `node-${idCounter++}`,
                            word,
                            cn,
                            affix,
                            affixType,
                            affixColor,
                            moduleId: moduleObj.id,
                            moduleName,
                            moduleColor: modColor,
                            children: [],
                            isRoot: false,
                            level: 0
                        };

                        while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) {
                            stack.pop();
                        }
                        const parent = stack[stack.length - 1].node;
                        node.level = parent.level + 1;
                        parent.children.push(node);
                        stack.push({ indent: item.indent, node });

                        moduleObj.allNodes.push(node);
                    }

                    // 模块顶层子节点直接连接至中心节点
                    tempRoot.children.forEach(c => {
                        moduleObj.topNodes.push(c);
                        rootNode.children.push(c);
                    });
                }
            });

            if (rootNode.children.length > 0) {
                return rootNode;
            }
        }

        // B. 纯 Markdown 列表（无 H2 标题时，根据顶层大纲自动划定模块扇区）
        const bodyLines = cleanBody.split("\n");
        const listItems = [];
        for (let i = 0; i < bodyLines.length; i++) {
            const line = bodyLines[i];
            const mList = line.match(/^(\s*)[-*+]\s+(.*)/);
            if (mList) {
                const indent = mList[1].replace(/\t/g, "  ").length;
                const text = mList[2].trim();
                if (text.startsWith("拼：") || text.startsWith("tags:")) continue;
                listItems.push({ indent, text });
            }
        }

        if (listItems.length > 0) {
            const stack = [{ indent: -1, node: rootNode }];
            let topBranchIdx = 0;

            for (const item of listItems) {
                const { word, cn, affix, affixType } = this.extractAffixAndWord(item.text, rootWord);
                if (!word || word.toLowerCase() === rootWord.toLowerCase()) continue;

                const affixColor = affix ? this.getAffixColor(affix) : null;

                const node = {
                    id: `node-${idCounter++}`,
                    word,
                    cn,
                    affix,
                    affixType,
                    affixColor,
                    children: [],
                    isRoot: false,
                    level: 0
                };

                while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) {
                    stack.pop();
                }
                const parent = stack[stack.length - 1].node;
                node.level = parent.level + 1;

                if (node.level === 1) {
                    const branchColor = MODULE_PALETTES[topBranchIdx % MODULE_PALETTES.length];
                    node.moduleColor = branchColor;
                    node.branchIndex = topBranchIdx;
                    topBranchIdx++;
                } else {
                    node.moduleColor = parent.moduleColor || MODULE_PALETTES[0];
                    node.branchIndex = parent.branchIndex || 0;
                }

                parent.children.push(node);
                stack.push({ indent: item.indent, node });
            }
        }

        return rootNode;
    }

    mountInteractiveGraph(container, rootNode, sourcePath) {
        if (container.empty) container.empty();
        else container.innerHTML = "";

        const width = 1040;
        const height = 780;
        const cx = width / 2;
        const cy = height / 2;
        const rootR = 44;

        const fileSaved = (sourcePath && this.savedPositions[sourcePath]) ? this.savedPositions[sourcePath] : {};

        const allNodes = [];
        const allEdges = [];

        // 1. 初始化中心节点（笔记标题作为核心）
        rootNode.x = cx;
        rootNode.y = cy;
        rootNode.r = rootR;
        allNodes.push(rootNode);

        const modules = rootNode.modules || [];
        const hasModules = modules.length > 1;

        // 收集所有节点与连线
        if (hasModules) {
            modules.forEach(mod => {
                mod.topNodes.forEach(child => {
                    allNodes.push(child);
                    allEdges.push({
                        id: `edge-${rootNode.id}-${child.id}`,
                        fromId: rootNode.id,
                        toId: child.id,
                        moduleColor: mod.color,
                        affixColor: child.affixColor
                    });

                    function collectSubNodes(pNode, children) {
                        if (!children || children.length === 0) return;
                        children.forEach(subChild => {
                            allNodes.push(subChild);
                            allEdges.push({
                                id: `edge-${pNode.id}-${subChild.id}`,
                                fromId: pNode.id,
                                toId: subChild.id,
                                moduleColor: mod.color,
                                affixColor: subChild.affixColor
                            });
                            collectSubNodes(subChild, subChild.children);
                        });
                    }
                    collectSubNodes(child, child.children);
                });
            });
        } else {
            const topChildren = rootNode.children || [];
            topChildren.forEach(child => {
                allNodes.push(child);
                allEdges.push({
                    id: `edge-${rootNode.id}-${child.id}`,
                    fromId: rootNode.id,
                    toId: child.id,
                    moduleColor: child.moduleColor,
                    affixColor: child.affixColor
                });
                function collectSubNodes(pNode, children) {
                    if (!children || children.length === 0) return;
                    children.forEach(subChild => {
                        allNodes.push(subChild);
                        allEdges.push({
                            id: `edge-${pNode.id}-${subChild.id}`,
                            fromId: pNode.id,
                            toId: subChild.id,
                            moduleColor: subChild.moduleColor,
                            affixColor: subChild.affixColor
                        });
                        collectSubNodes(subChild, subChild.children);
                    });
                }
                collectSubNodes(child, child.children);
            });
        }

        // 预估节点宽高以供碰撞消解使用
        allNodes.forEach(n => {
            if (!n.isRoot) {
                const hasAffix = Boolean(n.affix && n.affixColor);
                const wordLen = n.word.length * 9.5;
                const cnLen = (n.cn || "").length * 13;
                const textLen = Math.max(wordLen, cnLen, hasAffix ? 64 : 48);
                n.pillHalfW = textLen / 2 + 7;
                n.pillHalfH = hasAffix ? 24 : 19;
            }
        });

        // 自动整理排版算法（权重扇区分配 + 径向同心分层 + 严格物理碰撞消解）
        const performAutoLayout = () => {
            rootNode.x = cx;
            rootNode.y = cy;

            if (hasModules) {
                const K = modules.length;
                const gapAngle = (40 * Math.PI) / 180; // 40度模块间自然隔离空隙
                const totalAvail = 2 * Math.PI - K * gapAngle;

                const modWeights = modules.map(m => {
                    let count = 0;
                    m.topNodes.forEach(b => {
                        count += Math.max(b.children ? b.children.length : 1, 1);
                    });
                    return Math.max(count, 1);
                });
                const totalWeight = modWeights.reduce((a, b) => a + b, 0);

                let curAngle = -Math.PI / 2; // 12 点钟起始

                modules.forEach((mod, mIdx) => {
                    const span = (modWeights[mIdx] / totalWeight) * totalAvail;
                    const startA = curAngle;
                    const endA = curAngle + span;
                    curAngle = endA + gapAngle;

                    mod.startAngle = startA;
                    mod.endAngle = endA;

                    const branchWeights = mod.topNodes.map(b => Math.max(b.children ? b.children.length : 1, 1));
                    const totalBranchWeight = branchWeights.reduce((a, b) => a + b, 0);

                    let branchCurAngle = startA;
                    mod.topNodes.forEach((branch, bIdx) => {
                        const bSpan = (branchWeights[bIdx] / totalBranchWeight) * span;
                        const bMidAngle = branchCurAngle + bSpan / 2;

                        branch.angle = bMidAngle;
                        branch.targetAngle = bMidAngle;
                        branch.x = Math.round(cx + 185 * Math.cos(bMidAngle));
                        branch.y = Math.round(cy + 185 * Math.sin(bMidAngle));

                        const numChildren = branch.children ? branch.children.length : 0;
                        if (numChildren === 1) {
                            const child = branch.children[0];
                            child.angle = bMidAngle;
                            child.targetAngle = bMidAngle;
                            child.x = Math.round(cx + 295 * Math.cos(bMidAngle));
                            child.y = Math.round(cy + 295 * Math.sin(bMidAngle));
                        } else if (numChildren > 1) {
                            const cStep = bSpan / numChildren;
                            branch.children.forEach((child, cIdx) => {
                                const cAngle = branchCurAngle + (cIdx + 0.5) * cStep;
                                child.angle = cAngle;
                                child.targetAngle = cAngle;
                                child.x = Math.round(cx + 295 * Math.cos(cAngle));
                                child.y = Math.round(cy + 295 * Math.sin(cAngle));
                            });
                        }

                        branchCurAngle += bSpan;
                    });
                });
            } else {
                const topChildren = rootNode.children || [];
                const N = topChildren.length;
                const baseAngle = -Math.PI / 2;
                topChildren.forEach((child, idx) => {
                    const childAngle = baseAngle + (2 * Math.PI * idx) / Math.max(N, 1);
                    child.angle = childAngle;
                    child.targetAngle = childAngle;
                    child.x = Math.round(cx + 180 * Math.cos(childAngle));
                    child.y = Math.round(cy + 180 * Math.sin(childAngle));

                    const numSub = child.children ? child.children.length : 0;
                    if (numSub > 0) {
                        const spread = Math.min(Math.PI / 3, (Math.PI / 7) * numSub);
                        const step = numSub > 1 ? (spread * 2) / (numSub - 1) : 0;
                        child.children.forEach((sub, sIdx) => {
                            const sAngle = numSub > 1 ? (childAngle - spread + sIdx * step) : childAngle;
                            sub.angle = sAngle;
                            sub.targetAngle = sAngle;
                            sub.x = Math.round(cx + 290 * Math.cos(sAngle));
                            sub.y = Math.round(cy + 290 * Math.sin(sAngle));
                        });
                    }
                });
            }

            // 严格碰撞消解与间距优化（80次迭代消除任何药丸重叠）
            const minGapX = 26;
            const minGapY = 22;

            for (let it = 0; it < 80; it++) {
                for (let i = 0; i < allNodes.length; i++) {
                    for (let j = i + 1; j < allNodes.length; j++) {
                        const a = allNodes[i];
                        const b = allNodes[j];
                        if (a.isRoot && b.isRoot) continue;

                        let dx = b.x - a.x;
                        let dy = b.y - a.y;

                        const aW = a.isRoot ? a.r : (a.pillHalfW || 38);
                        const bW = b.isRoot ? b.r : (b.pillHalfW || 38);
                        const aH = a.isRoot ? a.r : (a.pillHalfH || 20);
                        const bH = b.isRoot ? b.r : (b.pillHalfH || 20);

                        const reqW = aW + bW + minGapX;
                        const reqH = aH + bH + minGapY;

                        const overlapX = reqW - Math.abs(dx);
                        const overlapY = reqH - Math.abs(dy);

                        if (overlapX > 0 && overlapY > 0) {
                            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
                                dx = (Math.random() - 0.5) * 4;
                                dy = (Math.random() - 0.5) * 4;
                            }

                            let pushX = 0, pushY = 0;
                            if (overlapX / reqW < overlapY / reqH) {
                                pushX = (dx >= 0 ? 1 : -1) * overlapX * 0.55;
                            } else {
                                pushY = (dy >= 0 ? 1 : -1) * overlapY * 0.55;
                            }

                            if (!a.isRoot && !b.isRoot) {
                                a.x -= pushX * 0.5;
                                a.y -= pushY * 0.5;
                                b.x += pushX * 0.5;
                                b.y += pushY * 0.5;
                            } else if (a.isRoot && !b.isRoot) {
                                b.x += pushX;
                                b.y += pushY;
                            } else if (!a.isRoot && b.isRoot) {
                                a.x -= pushX;
                                a.y -= pushY;
                            }
                        }
                    }
                }

                // 保持径向安全距离，确保中心主词拥有独立宽敞核心区
                for (let i = 0; i < allNodes.length; i++) {
                    const n = allNodes[i];
                    if (n.isRoot) continue;

                    const rx = n.x - cx;
                    const ry = n.y - cy;
                    const dist = Math.hypot(rx, ry) || 1;
                    const minAllowedDist = n.level === 1 ? 175 : 280;

                    if (dist < minAllowedDist) {
                        const delta = minAllowedDist - dist;
                        n.x += (rx / dist) * delta * 0.25;
                        n.y += (ry / dist) * delta * 0.25;
                    }
                }
            }

            // 模块虚线框碰撞消解与间距保护（彻底杜绝虚线框重叠，保证模块间距 >= 28px）
            if (hasModules && modules.length > 1) {
                const minBoxGap = 28;

                const getModBox = (mod) => {
                    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
                    mod.allNodes.forEach(n => {
                        const hw = (n.pillHalfW || 35) + 6;
                        const hh = (n.pillHalfH || 20) + 6;
                        bMinX = Math.min(bMinX, n.x - hw);
                        bMaxX = Math.max(bMaxX, n.x + hw);
                        bMinY = Math.min(bMinY, n.y - hh);
                        bMaxY = Math.max(bMaxY, n.y + hh);
                    });
                    const padX = 20, padY = 18;
                    return {
                        minX: bMinX - padX,
                        minY: bMinY - padY,
                        maxX: bMaxX + padX,
                        maxY: bMaxY + padY
                    };
                };

                for (let it = 0; it < 60; it++) {
                    let hadOverlap = false;
                    for (let i = 0; i < modules.length; i++) {
                        for (let j = i + 1; j < modules.length; j++) {
                            const a = getModBox(modules[i]);
                            const b = getModBox(modules[j]);

                            const overlapX = Math.min(a.maxX + minBoxGap, b.maxX + minBoxGap) - Math.max(a.minX, b.minX);
                            const overlapY = Math.min(a.maxY + minBoxGap, b.maxY + minBoxGap) - Math.max(a.minY, b.minY);

                            if (overlapX > 0 && overlapY > 0) {
                                hadOverlap = true;
                                const cAx = (a.minX + a.maxX) / 2;
                                const cAy = (a.minY + a.maxY) / 2;
                                const cBx = (b.minX + b.maxX) / 2;
                                const cBy = (b.minY + b.maxY) / 2;
                                let dx = cBx - cAx;
                                let dy = cBy - cAy;
                                if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
                                    dx = 1; dy = 1;
                                }

                                let pushX = 0, pushY = 0;
                                if (overlapX < overlapY) {
                                    pushX = (dx > 0 ? 1 : -1) * (overlapX * 0.55);
                                } else {
                                    pushY = (dy > 0 ? 1 : -1) * (overlapY * 0.55);
                                }

                                modules[i].allNodes.forEach(n => { n.x -= pushX * 0.5; n.y -= pushY * 0.5; });
                                modules[j].allNodes.forEach(n => { n.x += pushX * 0.5; n.y += pushY * 0.5; });
                            }
                        }
                    }
                    if (!hadOverlap) break;
                }
            }

            // 自动计算全局最佳居中视角与自适应缩放比
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            allNodes.forEach(n => {
                const hw = n.isRoot ? n.r : (n.pillHalfW || 38);
                const hh = n.isRoot ? n.r : (n.pillHalfH || 20);
                minX = Math.min(minX, n.x - hw);
                maxX = Math.max(maxX, n.x + hw);
                minY = Math.min(minY, n.y - hh);
                maxY = Math.max(maxY, n.y + hh);
            });

            const padTotal = 40;
            const graphW = (maxX - minX) + padTotal * 2;
            const graphH = (maxY - minY) + padTotal * 2;
            const midX = (minX + maxX) / 2;
            const midY = (minY + maxY) / 2;

            const scaleX = width / Math.max(graphW, 100);
            const scaleY = height / Math.max(graphH, 100);
            const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY) * 0.94, 0.45), 1.15);

            const fitPanX = cx - midX * fitScale;
            const fitPanY = cy - midY * fitScale;

            return { fitScale, fitPanX, fitPanY };
        };

        // 默认自动运行自适应排版
        let initialFit = performAutoLayout();

        // 若之前有特定手动移动微调且未清空，予以保留
        allNodes.forEach(n => {
            const saved = fileSaved[n.word];
            if (saved && saved.x !== undefined && saved.y !== undefined) {
                n.x = saved.x;
                n.y = saved.y;
            }
        });

        // 3. 构建 SVG 视图容器
        const wrapper = document.createElement("div");
        wrapper.className = "radial-graph-wrapper";
        wrapper.style.position = "relative";
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";
        wrapper.style.overflow = "hidden";

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.cursor = "grab";
        svg.style.overflow = "visible";

        // Viewport 变换层（平滑滚轮缩放与平移）
        const viewportGroup = document.createElementNS(svgNS, "g");
        viewportGroup.setAttribute("class", "radial-viewport");
        svg.appendChild(viewportGroup);

        // 各层级：模块虚线框层 -> 连线层 -> 箭头层 -> 节点层
        const moduleBoxLayer = document.createElementNS(svgNS, "g");
        viewportGroup.appendChild(moduleBoxLayer);

        const lineLayer = document.createElementNS(svgNS, "g");
        viewportGroup.appendChild(lineLayer);

        const arrowLayer = document.createElementNS(svgNS, "g");
        viewportGroup.appendChild(arrowLayer);

        const nodeLayer = document.createElementNS(svgNS, "g");
        viewportGroup.appendChild(nodeLayer);

        const edgeMap = new Map();
        const nodeMap = new Map();
        const moduleBoxMap = new Map();

        allEdges.forEach(e => {
            // 连线与指示颜色：若有相同词缀，与词缀色呼应；否则采用 Catppuccin 模块主题色
            const strokeColor = (e.affixColor && e.affixColor.stroke)
                ? e.affixColor.stroke
                : ((e.moduleColor && e.moduleColor.stroke) ? e.moduleColor.stroke : "var(--ctp-lavender, #7287fd)");

            // 1. 平滑贝塞尔曲线或平滑直连路径（顶级脑图 Markmap/D3 范式）
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("class", "radial-edge-path");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", strokeColor);
            path.setAttribute("stroke-width", "1.75");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            path.setAttribute("stroke-opacity", "0.75");
            lineLayer.appendChild(path);

            // 2. 起始端圆形锚点微标（经典开源知识图谱圆形连接美学）
            const startDot = document.createElementNS(svgNS, "circle");
            startDot.setAttribute("class", "edge-start-dot");
            startDot.setAttribute("r", "3");
            startDot.setAttribute("fill", strokeColor);
            lineLayer.appendChild(startDot);

            // 3. 终点连接圆点（呼应目标胶囊接入点）
            const endDot = document.createElementNS(svgNS, "circle");
            endDot.setAttribute("class", "edge-end-dot");
            endDot.setAttribute("r", "3.2");
            endDot.setAttribute("fill", strokeColor);
            arrowLayer.appendChild(endDot);

            // 4. 精巧微型指示箭头
            const arrow = document.createElementNS(svgNS, "polygon");
            arrow.setAttribute("class", "edge-arrow");
            arrow.setAttribute("fill", strokeColor);
            arrowLayer.appendChild(arrow);

            edgeMap.set(e.id, { pathEl: path, startDotEl: startDot, endDotEl: endDot, arrowEl: arrow, fromId: e.fromId, toId: e.toId, strokeColor });
        });

        allNodes.forEach(n => {
            const g = document.createElementNS(svgNS, "g");
            g.setAttribute("class", "radial-node-group");
            g.setAttribute("data-id", n.id);
            g.style.cursor = "grab";

            if (n.isRoot) {
                // 中心标题节点：天体太阳核心多环美学 (Celestial Sun Core)
                g.setAttribute("class", "radial-node-group radial-root-group");

                // 外层虚线公转轨道环
                const orbitOuter = document.createElementNS(svgNS, "circle");
                orbitOuter.setAttribute("class", "orbit-ring-outer");
                orbitOuter.setAttribute("r", n.r + 9);
                orbitOuter.setAttribute("fill", "none");
                orbitOuter.setAttribute("stroke", "var(--ctp-lavender, #7287fd)");
                orbitOuter.setAttribute("stroke-width", "1.2");
                orbitOuter.setAttribute("stroke-dasharray", "4 4");
                orbitOuter.setAttribute("stroke-opacity", "0.45");
                g.appendChild(orbitOuter);

                // 内层柔和星芒光晕
                const orbitGlow = document.createElementNS(svgNS, "circle");
                orbitGlow.setAttribute("class", "orbit-ring-glow");
                orbitGlow.setAttribute("r", n.r + 4);
                orbitGlow.setAttribute("fill", "rgba(114, 135, 253, 0.08)");
                orbitGlow.setAttribute("stroke", "var(--ctp-lavender, #7287fd)");
                orbitGlow.setAttribute("stroke-width", "0.75");
                orbitGlow.setAttribute("stroke-opacity", "0.3");
                g.appendChild(orbitGlow);

                // 主体核心圆形球体
                const coreCircle = document.createElementNS(svgNS, "circle");
                coreCircle.setAttribute("class", "center-core-circle");
                coreCircle.setAttribute("r", n.r);
                coreCircle.setAttribute("fill", "var(--ctp-card-bg, #ffffff)");
                coreCircle.setAttribute("stroke", "var(--ctp-lavender, #7287fd)");
                coreCircle.setAttribute("stroke-width", "2.6");
                g.appendChild(coreCircle);

                // 核心主词
                const tWord = document.createElementNS(svgNS, "text");
                tWord.textContent = n.word;
                tWord.setAttribute("class", "node-text-word");
                tWord.setAttribute("y", "-4");
                tWord.setAttribute("font-size", "18");
                tWord.setAttribute("font-weight", "700");
                tWord.setAttribute("fill", "var(--ctp-text, #4c4f69)");
                tWord.setAttribute("text-anchor", "middle");
                g.appendChild(tWord);

                // 中文释义标签
                const tCn = document.createElementNS(svgNS, "text");
                tCn.textContent = n.cn;
                tCn.setAttribute("class", "node-text-cn");
                tCn.setAttribute("y", "17");
                tCn.setAttribute("font-size", "12.5");
                tCn.setAttribute("font-weight", "500");
                tCn.setAttribute("fill", "var(--ctp-subtext0, #6c6f85)");
                tCn.setAttribute("text-anchor", "middle");
                g.appendChild(tCn);
            } else {
                const hasAffix = Boolean(n.affix && n.affixColor);
                const borderColor = hasAffix ? n.affixColor.stroke : (n.moduleColor ? n.moduleColor.stroke : "var(--ctp-overlay1, #8c8fa1)");

                // 圆润胶囊形态 (rx="15" ry="15")
                const pillBg = document.createElementNS(svgNS, "rect");
                pillBg.setAttribute("class", "pill-bg");
                pillBg.setAttribute("rx", "15");
                pillBg.setAttribute("ry", "15");
                pillBg.setAttribute("fill", "var(--ctp-card-bg, #ffffff)");
                pillBg.setAttribute("stroke", borderColor);
                pillBg.setAttribute("stroke-width", hasAffix ? "1.8" : "1.4");
                g.appendChild(pillBg);

                // 词缀微型徽章（相同词缀完全共享相同 Catppuccin 色标）
                if (hasAffix) {
                    const affixGroup = document.createElementNS(svgNS, "g");
                    affixGroup.setAttribute("class", "affix-tag-group");

                    const affixRect = document.createElementNS(svgNS, "rect");
                    affixRect.setAttribute("class", "affix-tag-rect");
                    affixRect.setAttribute("rx", "5");
                    affixRect.setAttribute("ry", "5");
                    affixRect.setAttribute("fill", n.affixColor.bg);
                    affixRect.setAttribute("stroke", n.affixColor.stroke);
                    affixRect.setAttribute("stroke-width", "0.85");
                    affixGroup.appendChild(affixRect);

                    const affixText = document.createElementNS(svgNS, "text");
                    affixText.textContent = n.affix;
                    affixText.setAttribute("class", "affix-tag-text");
                    affixText.setAttribute("font-size", "9.5");
                    affixText.setAttribute("font-weight", "700");
                    affixText.setAttribute("fill", n.affixColor.text);
                    affixText.setAttribute("text-anchor", "middle");
                    affixGroup.appendChild(affixText);

                    g.appendChild(affixGroup);
                }

                const tWord = document.createElementNS(svgNS, "text");
                tWord.textContent = n.word;
                tWord.setAttribute("class", "node-text-word");
                tWord.setAttribute("font-size", "14");
                tWord.setAttribute("font-weight", "650");
                tWord.setAttribute("fill", "var(--ctp-text, #4c4f69)");
                tWord.setAttribute("text-anchor", "middle");
                g.appendChild(tWord);

                const tCn = document.createElementNS(svgNS, "text");
                tCn.textContent = n.cn;
                tCn.setAttribute("class", "node-text-cn");
                tCn.setAttribute("font-size", "11.5");
                tCn.setAttribute("fill", "var(--ctp-subtext0, #6c6f85)");
                tCn.setAttribute("text-anchor", "middle");
                g.appendChild(tCn);
            }

            nodeLayer.appendChild(g);
            nodeMap.set(n.id, { data: n, el: g });
        });

        // 4. 模块虚线框与标志性小标题创建（带圆形指示珠）
        if (hasModules) {
            modules.forEach(mod => {
                const boxG = document.createElementNS(svgNS, "g");
                boxG.setAttribute("class", "module-cluster-group");

                const dashedRect = document.createElementNS(svgNS, "rect");
                dashedRect.setAttribute("rx", "18");
                dashedRect.setAttribute("ry", "18");
                dashedRect.setAttribute("fill", mod.color.bg);
                dashedRect.setAttribute("stroke", mod.color.stroke);
                dashedRect.setAttribute("stroke-dasharray", "5 5");
                dashedRect.setAttribute("stroke-width", "1.2");
                dashedRect.setAttribute("stroke-opacity", "0.4");
                boxG.appendChild(dashedRect);

                const badgeG = document.createElementNS(svgNS, "g");
                badgeG.setAttribute("class", "module-badge-group");

                const badgeBg = document.createElementNS(svgNS, "rect");
                badgeBg.setAttribute("rx", "10");
                badgeBg.setAttribute("ry", "10");
                badgeBg.setAttribute("fill", "var(--ctp-card-bg, #ffffff)");
                badgeBg.setAttribute("stroke", mod.color.stroke);
                badgeBg.setAttribute("stroke-width", "1.2");
                badgeBg.setAttribute("height", "22");
                badgeG.appendChild(badgeBg);

                // 圆形指示珠 (参考顶级项目设计)
                const badgeDot = document.createElementNS(svgNS, "circle");
                badgeDot.setAttribute("r", "3.2");
                badgeDot.setAttribute("fill", mod.color.stroke);
                badgeDot.setAttribute("cy", "11");
                badgeG.appendChild(badgeDot);

                const badgeText = document.createElementNS(svgNS, "text");
                badgeText.textContent = mod.name;
                badgeText.setAttribute("font-size", "11.5");
                badgeText.setAttribute("font-weight", "600");
                badgeText.setAttribute("fill", mod.color.stroke);
                badgeText.setAttribute("text-anchor", "start");
                badgeText.setAttribute("y", "15");
                badgeG.appendChild(badgeText);

                boxG.appendChild(badgeG);
                moduleBoxLayer.appendChild(boxG);

                moduleBoxMap.set(mod.id, {
                    module: mod,
                    boxG,
                    dashedRect,
                    badgeG,
                    badgeBg,
                    badgeDot,
                    badgeText
                });
            });
        }

        function updateNodeTransform(nodeData) {
            const entry = nodeMap.get(nodeData.id);
            if (!entry) return;
            entry.el.setAttribute("transform", `translate(${nodeData.x}, ${nodeData.y})`);

            if (!nodeData.isRoot) {
                const rect = entry.el.querySelector(".pill-bg");
                const tWord = entry.el.querySelector(".node-text-word");
                const tCn = entry.el.querySelector(".node-text-cn");
                const affixG = entry.el.querySelector(".affix-tag-group");

                const hasAffix = Boolean(nodeData.affix && nodeData.affixColor);
                const wordLen = nodeData.word.length * 9.5;
                const cnLen = (nodeData.cn || "").length * 13;
                const textLen = Math.max(wordLen, cnLen, hasAffix ? 64 : 48);
                const halfW = textLen / 2 + 10;

                if (hasAffix) {
                    const halfH = 24;
                    rect.setAttribute("x", -halfW);
                    rect.setAttribute("y", -halfH);
                    rect.setAttribute("width", halfW * 2);
                    rect.setAttribute("height", halfH * 2);
                    rect.setAttribute("rx", "16");
                    rect.setAttribute("ry", "16");

                    // 徽章微标位置
                    if (affixG) {
                        const affixRect = affixG.querySelector(".affix-tag-rect");
                        const affixText = affixG.querySelector(".affix-tag-text");
                        const tagW = Math.max(nodeData.affix.length * 7 + 12, 28);
                        const tagH = 13;
                        affixRect.setAttribute("x", -tagW / 2);
                        affixRect.setAttribute("y", -halfH + 3.5);
                        affixRect.setAttribute("width", tagW);
                        affixRect.setAttribute("height", tagH);
                        affixRect.setAttribute("rx", "5");
                        affixRect.setAttribute("ry", "5");

                        affixText.setAttribute("x", 0);
                        affixText.setAttribute("y", -halfH + 13.5);
                    }

                    tWord.setAttribute("y", 6);
                    tCn.setAttribute("y", 20);

                    nodeData.pillHalfW = halfW;
                    nodeData.pillHalfH = halfH;
                } else {
                    const halfH = 19;
                    rect.setAttribute("x", -halfW);
                    rect.setAttribute("y", -halfH);
                    rect.setAttribute("width", halfW * 2);
                    rect.setAttribute("height", halfH * 2);
                    rect.setAttribute("rx", "15");
                    rect.setAttribute("ry", "15");

                    tWord.setAttribute("y", -3);
                    tCn.setAttribute("y", 15);

                    nodeData.pillHalfW = halfW;
                    nodeData.pillHalfH = halfH;
                }
            }
        }

        function updateModuleBoxes() {
            if (!hasModules) return;

            modules.forEach(mod => {
                const entry = moduleBoxMap.get(mod.id);
                if (!entry) return;

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                mod.allNodes.forEach(n => {
                    const hw = (n.pillHalfW || 35) + 6;
                    const hh = (n.pillHalfH || 20) + 6;
                    minX = Math.min(minX, n.x - hw);
                    maxX = Math.max(maxX, n.x + hw);
                    minY = Math.min(minY, n.y - hh);
                    maxY = Math.max(maxY, n.y + hh);
                });

                if (minX !== Infinity) {
                    const padX = 20;
                    const padY = 18;
                    const boxX = minX - padX;
                    const boxY = minY - padY;
                    const boxW = (maxX - minX) + padX * 2;
                    const boxH = (maxY - minY) + padY * 2;

                    entry.dashedRect.setAttribute("x", boxX);
                    entry.dashedRect.setAttribute("y", boxY);
                    entry.dashedRect.setAttribute("width", boxW);
                    entry.dashedRect.setAttribute("height", boxH);

                    // 标志小徽章定位在虚线框上方边缘（带精致圆形状态珠）
                    const badgeTextWidth = mod.name.length * 13 + 30;
                    entry.badgeBg.setAttribute("width", badgeTextWidth);
                    entry.badgeDot.setAttribute("cx", "12");
                    entry.badgeDot.setAttribute("cy", "11");
                    entry.badgeText.setAttribute("x", "20");
                    entry.badgeG.setAttribute("transform", `translate(${boxX + 16}, ${boxY - 11})`);
                }
            });
        }

        function updateEdges() {
            edgeMap.forEach(e => {
                const fromNode = nodeMap.get(e.fromId).data;
                const toNode = nodeMap.get(e.toId).data;

                const dx = toNode.x - fromNode.x;
                const dy = toNode.y - fromNode.y;
                const dist = Math.hypot(dx, dy) || 1;
                const ux = dx / dist;
                const uy = dy / dist;

                let x1 = fromNode.x;
                let y1 = fromNode.y;
                if (fromNode.isRoot) {
                    x1 = fromNode.x + ux * (fromNode.r + 2.5);
                    y1 = fromNode.y + uy * (fromNode.r + 2.5);
                } else {
                    const pHalfW = fromNode.pillHalfW || 28;
                    const pHalfH = fromNode.pillHalfH || 18;
                    const pScaleX = Math.abs(ux) > 0.001 ? pHalfW / Math.abs(ux) : 9999;
                    const pScaleY = Math.abs(uy) > 0.001 ? pHalfH / Math.abs(uy) : 9999;
                    const pBoxDist = Math.min(pScaleX, pScaleY);
                    x1 = fromNode.x + ux * (pBoxDist + 2);
                    y1 = fromNode.y + uy * (pBoxDist + 2);
                }

                const halfW = toNode.pillHalfW || 28;
                const halfH = toNode.pillHalfH || 18;
                const scaleX = Math.abs(ux) > 0.001 ? halfW / Math.abs(ux) : 9999;
                const scaleY = Math.abs(uy) > 0.001 ? halfH / Math.abs(uy) : 9999;
                const boxDist = Math.min(scaleX, scaleY);

                // 目标胶囊边缘接入点
                const stopDist = boxDist + 2.5;
                const p0x = toNode.x - ux * stopDist;
                const p0y = toNode.y - uy * stopDist;

                // 箭头参数 (精巧高颜值微型箭头)
                const arrowLen = 6.8;
                const arrowWidth = 3.6;
                const vx = -uy;
                const vy = ux;

                const p1x = p0x - ux * arrowLen + vx * arrowWidth;
                const p1y = p0y - uy * arrowLen + vy * arrowWidth;
                const p2x = p0x - ux * arrowLen - vx * arrowWidth;
                const p2y = p0y - uy * arrowLen - vy * arrowWidth;

                const lineEndX = p0x - ux * (arrowLen * 0.7);
                const lineEndY = p0y - uy * (arrowLen * 0.7);

                // 判断是否为子级分支：如果是父节点到子节点，使用优雅三次贝塞尔平滑曲线 (Markmap 曲线美学)
                if (!fromNode.isRoot) {
                    const curvature = Math.min(dist * 0.38, 50);
                    const fromRdx = fromNode.x - cx;
                    const fromRdy = fromNode.y - cy;
                    const fromRDist = Math.hypot(fromRdx, fromRdy) || 1;
                    const rUx = fromRdx / fromRDist;
                    const rUy = fromRdy / fromRDist;

                    const cp1x = x1 + (rUx * 0.65 + ux * 0.35) * curvature;
                    const cp1y = y1 + (rUy * 0.65 + uy * 0.35) * curvature;
                    const cp2x = lineEndX - ux * curvature;
                    const cp2y = lineEndY - uy * curvature;

                    e.pathEl.setAttribute("d", `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${lineEndX.toFixed(1)} ${lineEndY.toFixed(1)}`);
                } else {
                    // 中心向外的主干直连
                    e.pathEl.setAttribute("d", `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${lineEndX.toFixed(1)} ${lineEndY.toFixed(1)}`);
                }

                // 起始圆点与终点圆点更新
                e.startDotEl.setAttribute("cx", x1);
                e.startDotEl.setAttribute("cy", y1);
                e.endDotEl.setAttribute("cx", p0x);
                e.endDotEl.setAttribute("cy", p0y);

                e.arrowEl.setAttribute("points", `${p0x},${p0y} ${p1x},${p1y} ${p2x},${p2y}`);
            });
        }

        allNodes.forEach(n => updateNodeTransform(n));
        updateEdges();
        updateModuleBoxes();

        // 5. 平移与缩放逻辑（支持自然手势滚轮与一键整理布局）
        let scale = initialFit.fitScale || 1.0;
        let panX = initialFit.fitPanX || 0;
        let panY = initialFit.fitPanY || 0;

        function updateViewportTransform() {
            viewportGroup.setAttribute("transform", `translate(${panX}, ${panY}) scale(${scale})`);
        }

        updateViewportTransform();

        svg.addEventListener("wheel", (evt) => {
            evt.preventDefault();
            const rect = svg.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const mouseX = ((evt.clientX - rect.left) / rect.width) * width;
            const mouseY = ((evt.clientY - rect.top) / rect.height) * height;

            const zoomFactor = evt.deltaY < 0 ? 1.12 : 0.89;
            const newScale = Math.min(Math.max(scale * zoomFactor, 0.35), 3.5);

            panX = mouseX - (mouseX - panX) * (newScale / scale);
            panY = mouseY - (mouseY - panY) * (newScale / scale);
            scale = newScale;

            updateViewportTransform();
        }, { passive: false });

        // 背景拖拽平移与双击重置
        let isPanning = false;
        let startPanMouseX = 0, startPanMouseY = 0;
        let initialPanX = 0, initialPanY = 0;

        svg.addEventListener("mousedown", (evt) => {
            if (evt.target === svg || evt.target.tagName === "svg" || evt.target === lineLayer || evt.target.classList.contains("radial-viewport") || evt.target.classList.contains("module-cluster-group") || evt.target.tagName === "rect" && evt.target.getAttribute("stroke-dasharray")) {
                isPanning = true;
                startPanMouseX = evt.clientX;
                startPanMouseY = evt.clientY;
                initialPanX = panX;
                initialPanY = panY;
                svg.style.cursor = "grabbing";
            }
        });

        svg.addEventListener("dblclick", (evt) => {
            if (evt.target === svg || evt.target.tagName === "svg" || evt.target === lineLayer || evt.target.getAttribute("stroke-dasharray")) {
                scale = 1.0;
                panX = 0;
                panY = 0;
                updateViewportTransform();
            }
        });

        // 节点拖拽交互（结合当前 zoom scale 保证 1:1 绝对位移，同步更新虚线框）
        let activeDrag = null;
        let startClientX = 0, startClientY = 0;
        let moved = false;

        allNodes.forEach(n => {
            const entry = nodeMap.get(n.id);
            if (!entry) return;

            entry.el.addEventListener("mousedown", (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                activeDrag = n;
                startClientX = evt.clientX;
                startClientY = evt.clientY;
                moved = false;
                entry.el.style.cursor = "grabbing";
            });
        });

        const onMouseMove = (evt) => {
            if (isPanning) {
                const rect = svg.getBoundingClientRect();
                const svgScaleX = width / (rect.width || width);
                const svgScaleY = height / (rect.height || height);
                const dx = (evt.clientX - startPanMouseX) * svgScaleX;
                const dy = (evt.clientY - startPanMouseY) * svgScaleY;
                panX = initialPanX + dx;
                panY = initialPanY + dy;
                updateViewportTransform();
                return;
            }

            if (!activeDrag) return;

            const rect = svg.getBoundingClientRect();
            const svgScaleX = width / (rect.width || width);
            const svgScaleY = height / (rect.height || height);

            const dx = ((evt.clientX - startClientX) * svgScaleX) / scale;
            const dy = ((evt.clientY - startClientY) * svgScaleY) / scale;
            if (Math.hypot(dx, dy) > 2) moved = true;

            activeDrag.x += dx;
            activeDrag.y += dy;
            startClientX = evt.clientX;
            startClientY = evt.clientY;

            updateNodeTransform(activeDrag);
            updateEdges();
            updateModuleBoxes();
        };

        const onMouseUp = async () => {
            if (isPanning) {
                isPanning = false;
                svg.style.cursor = "grab";
            }

            if (!activeDrag) return;
            const entry = nodeMap.get(activeDrag.id);
            if (entry) entry.el.style.cursor = "grab";

            if (moved) {
                await this.saveNodePosition(sourcePath, activeDrag.word, activeDrag.x, activeDrag.y);
            } else if (!activeDrag.isRoot && this.app.workspace && this.app.workspace.openLinkText) {
                this.app.workspace.openLinkText(activeDrag.word, sourcePath || "");
            }
            activeDrag = null;
        };

        if (container._radialCleanup) {
            container._radialCleanup();
        }
        container._radialCleanup = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        // 6. Catppuccin 悬浮操作胶囊栏 (整理布局 + 视口缩放与适应)
        const toolbar = document.createElement("div");
        toolbar.className = "radial-toolbar";

        // (1) 一键自动整理布局按钮
        const tidyBtn = document.createElement("button");
        tidyBtn.className = "radial-toolbar-btn radial-btn-tidy";
        tidyBtn.innerHTML = `
            <span class="radial-tidy-icon">✨</span>
            <span class="radial-tidy-text">整理布局</span>
        `;
        tidyBtn.title = "自动优化层级布局与元素间距";
        tidyBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (sourcePath && this.savedPositions[sourcePath]) {
                delete this.savedPositions[sourcePath];
                await this.saveData(this.savedPositions);
            }
            const res = performAutoLayout();
            allNodes.forEach(n => updateNodeTransform(n));
            updateEdges();
            updateModuleBoxes();
            scale = res.fitScale;
            panX = res.fitPanX;
            panY = res.fitPanY;
            updateViewportTransform();

            tidyBtn.classList.add("btn-active");
            setTimeout(() => tidyBtn.classList.remove("btn-active"), 500);
        });
        toolbar.appendChild(tidyBtn);

        // 分隔线
        const divider = document.createElement("div");
        divider.className = "radial-toolbar-divider";
        toolbar.appendChild(divider);

        // (2) 放大按钮
        const zoomInBtn = document.createElement("button");
        zoomInBtn.className = "radial-toolbar-btn icon-only";
        zoomInBtn.innerHTML = "＋";
        zoomInBtn.title = "放大视角";
        zoomInBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            scale = Math.min(scale * 1.18, 3.5);
            updateViewportTransform();
        });
        toolbar.appendChild(zoomInBtn);

        // (3) 缩小按钮
        const zoomOutBtn = document.createElement("button");
        zoomOutBtn.className = "radial-toolbar-btn icon-only";
        zoomOutBtn.innerHTML = "－";
        zoomOutBtn.title = "缩小视角";
        zoomOutBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            scale = Math.max(scale * 0.85, 0.35);
            updateViewportTransform();
        });
        toolbar.appendChild(zoomOutBtn);

        // (4) 居中适应按钮
        const fitBtn = document.createElement("button");
        fitBtn.className = "radial-toolbar-btn icon-only";
        fitBtn.innerHTML = "⟲";
        fitBtn.title = "重置居中并自适应视口";
        fitBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const fit = performAutoLayout();
            scale = fit.fitScale;
            panX = fit.fitPanX;
            panY = fit.fitPanY;
            updateViewportTransform();
        });
        toolbar.appendChild(fitBtn);

        wrapper.appendChild(toolbar);

        wrapper.appendChild(svg);
        container.appendChild(wrapper);
    }

    onunload() {
        console.log("Radial Vocab Plugin 卸载");
    }
}

module.exports = RadialVocabPlugin;
