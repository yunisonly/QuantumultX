/**
 * 小红书去广告 · 个人版 (Quantumult X, script-response-body)
 * 由社区脚本 (@ddgksf2013 V1.0.28) 反混淆整理重写: 去除混淆与 Env 框架、
 * 去除全部作者推广链接, 逻辑按接口合并实现。配套规则见 xhs_rules.conf。
 * 功能: 信息流广告过滤 / 笔记带货清理 / 无水印保存 / 开屏与搜索净化。
 */

const url = ($request && $request.url) || "";
let body = $response && $response.body;

// 轻量存储 (替代原 Env 框架): QX 用 $prefs, 其他环境回退 $persistentStore
const store = {
    get(k) {
        try { return typeof $prefs !== "undefined" ? $prefs.valueForKey(k) : $persistentStore.read(k); }
        catch (e) { return null; }
    },
    set(v, k) {
        try {
            if (typeof $prefs !== "undefined") $prefs.setValueForKey(v, k);
            else $persistentStore.write(v, k);
        } catch (e) {}
    }
};
const PHOTO_KEY = "xhs_photo_saves";
const VIDEO_KEY = "xhs_video_saves";
const NO_WATERMARK = { disable_save: false, disable_watermark: true, disable_weibo_cover: false };
const SHARE_TYPES = ["qq", "weixin", "weixin_moments", "weibo", "copy_link", "generate_image", "native_voice", "download_image"]
    .map(t => ({ type: t }));

function loadList(key) {
    try { return JSON.parse(store.get(key) || "[]"); } catch (e) { return []; }
}
function saveList(key, list) {
    while (list.length > 100) list.shift();
    store.set(JSON.stringify(list), key);
}

// 笔记卡片通用清理: 去带货标记 + 关水印 + 精简分享渠道
function cleanCard(card) {
    if (!card || typeof card !== "object") return;
    if ("related_goods_num" in card) card.related_goods_num = 0;
    if ("has_related_goods" in card) card.has_related_goods = false;
    if (card.media_save_config) card.media_save_config = { ...NO_WATERMARK };
    if (card.share_info) {
        if (Array.isArray(card.share_info.types)) card.share_info.types = SHARE_TYPES;
        else if (Array.isArray(card.share_info.share_types)) card.share_info.share_types = SHARE_TYPES;
    }
    if (Array.isArray(card.note_list)) {
        for (let n of card.note_list) if (n && n.media_save_config) n.media_save_config = { ...NO_WATERMARK };
    }
}

// 从视频流里留存无水印地址, 供保存接口替换 (原脚本 RedBookVideoKey 机制)
function captureVideo(card) {
    const stream = card && card.video_info_v2 && card.video_info_v2.media && card.video_info_v2.media.stream;
    if (!stream || !card.id) return;
    const url = (stream.h264 && stream.h264[0] && stream.h264[0].master_url) ||
                (stream.h265 && stream.h265[0] && stream.h265[0].master_url);
    if (!url) return;
    let list = loadList(VIDEO_KEY).filter(r => r.note_id !== card.id);
    list.push({ note_id: card.id, type: 2, download_url: url });
    saveList(VIDEO_KEY, list);
}

// 从图文流里留存实况照片的无水印地址 (原脚本 RedBookPhotoKey 机制)
function captureLivePhoto(item) {
    if (!item || !item.images_list) return;
    let list = null;
    for (let img of item.images_list) {
        const lv = img && (img.live_photo || img.video_info || img.video);
        if (!lv) continue;
        const url = (lv.h265 && lv.h265[0] && lv.h265[0].master_url) ||
                    (lv.h264 && lv.h264[0] && lv.h264[0].master_url);
        if (!url) continue;
        if (!list) list = loadList(PHOTO_KEY);
        list = list.filter(r => r.live_photo_file_id !== img.live_photo_file_id);
        list.push({ video_id: lv.video_id, live_photo_file_id: img.live_photo_file_id, download_url: url });
    }
    if (list) saveList(PHOTO_KEY, list);
}

// 品牌合作标记: widgets_context (JSON 字符串) 内的 order_cooperate=true。
// 这类推广贴 is_ads 常为 false (2026-10-29 样本「一介书生」卡), 2026-10-30 Han 定案一并屏蔽。
function hasCoop(c) {
    try {
        const w = c && c.widgets_context;
        if (!w) return false;
        const s = typeof w === "string" ? w : JSON.stringify(w);
        return /"order_cooperate"\s*:\s*true/.test(s);
    } catch (e) { return false; }
}

// 递归清空任意层级下名为 ads 的数组 (开屏配置用)
function clearAdsArrays(node, depth) {
    if (!node || typeof node !== "object" || depth > 3) return;
    for (let k of Object.keys(node)) {
        if (k === "ads" && Array.isArray(node[k])) node[k] = [];
        else clearAdsArrays(node[k], depth + 1);
    }
}

const ROUTES = [
    // 笔记页底部挂件 (商品/广告 widgets) 整段清空
    [/\/note\/widgets/, obj => { if ("data" in obj) obj.data = {}; }],

    // 视频保存: 用留存的无水印记录替换返回数据
    [/\/note\/video\/save/, obj => {
        if (!obj.data || !obj.data.note_id) return;
        const rec = loadList(VIDEO_KEY).find(r => r.note_id === obj.data.note_id);
        if (rec) obj.data = rec;
    }],

    // 实况照片保存: 补上留存的无水印地址
    [/\/note\/live_photo\/save/, obj => {
        if (!obj.data || !obj.data.live_photo_file_id) return;
        const rec = loadList(PHOTO_KEY).find(r => r.live_photo_file_id === obj.data.live_photo_file_id);
        if (rec) obj.data.download_url = rec.download_url;
    }],

    // 评论区: 表情包图片还原为普通图片地址
    [/\/note\/comment\/list/, obj => {
        const comments = (obj.data && obj.data.comments) || [];
        for (let c of comments) {
            if (!c || !Array.isArray(c.pictures)) continue;
            for (let p of c.pictures) {
                if (p && p.meme_package && p.meme_package.image_url) p.url = p.meme_package.image_url;
            }
        }
    }],

    // 视频笔记详情 (redtube): 去带货 + 无水印
    [/\/note\/redtube/, obj => {
        const items = (obj.data && obj.data.items) || [];
        for (let it of items) cleanCard(it);
    }],

    // 视频流 / 关注流: 去带货 + 无水印 + 留存视频地址
    [/\/note\/(tab|video)feed/, obj => {
        const items = (obj.data && (obj.data.items || obj.data)) || [];
        if (!Array.isArray(items)) return;
        for (let it of items) { cleanCard(it); captureVideo(it); }
    }],

    // 笔记流: 去带货 + 无水印
    [/\/note\/feed/, obj => {
        if (!Array.isArray(obj.data)) return;
        for (let it of obj.data) cleanCard(it);
    }],

    // 图文流: 去带货 + 无水印 + 留存实况地址
    [/\/note\/imagefeed/, obj => {
        const items = (obj.data && (obj.data.items || obj.data)) || [];
        if (!Array.isArray(items)) return;
        for (let it of items) {
            cleanCard(it);
            if (it && Array.isArray(it.note_list)) it.note_list.forEach(captureLivePhoto);
            captureLivePhoto(it);
        }
    }],

    // 首页频道栏: 去掉直播等频道 (原脚本另有一个被混淆的 oid, 未能还原)
    [/\/homefeed\/categories/, obj => {
        if (!obj.data || !Array.isArray(obj.data.categories)) return;
        const DROP = new Set(["homefeed.live", "homefeed.sketch"]);
        obj.data.categories = obj.data.categories.filter(c => c && !DROP.has(c.oid));
    }],

    // 发现页瀑布流: 滤掉推广卡 (2026-10-27 探针实锤: v6 接口已无 ads 字段,
    // 真实标记为 is_ads=true 且带 ads_info 对象; ads 保留兼容旧版本)
    [/\/homefeed\?/, obj => {
        const isAd = c => c && (c.ads || c.is_ads || c.ads_info || hasCoop(c));
        if (Array.isArray(obj.data)) obj.data = obj.data.filter(c => !isAd(c));
        else if (obj.data && Array.isArray(obj.data.items)) obj.data.items = obj.data.items.filter(c => !isAd(c));
    }],

    // 搜索结果: 同一套卡片标记, 滤掉推广卡
    [/\/search\/notes\?/, obj => {
        if (obj.data && Array.isArray(obj.data.items)) obj.data.items = obj.data.items.filter(c => !(c && (c.ads || c.is_ads || c.ads_info || hasCoop(c))));
    }],

    // 搜索页横幅: 清空
    [/\/search\/banner_list/, obj => { if ("data" in obj) obj.data = Array.isArray(obj.data) ? [] : {}; }],

    // 搜索框推荐词: 只留一个中性占位 (原脚本做法)
    [/\/search\/hint/, obj => {
        if (!obj.data) return;
        const key = ["hint_words", "words", "items", "list"].find(k => Array.isArray(obj.data[k]));
        if (key) obj.data[key] = [{ title: "搜索笔记", type: "firstEnterOther#itemCfRecWord#搜索笔记#1", search_word: "搜索笔记" }];
    }],

    // 热搜榜: 清空
    [/\/search\/hot_list/, obj => {
        obj.data = { scene: "", title: "", items: [], host: "", background_color: {}, word_request_id: "" };
    }],

    // 搜索趋势词: 清空
    [/\/search\/trending/, obj => {
        obj.data = { title: "", queries: [], type: "", word_request_id: "" };
    }],

    // 开屏广告配置: 清空其中所有 ads 数组
    [/\/system_service\/splash_config/, obj => { clearAdsArrays(obj.data, 0); }],

    // 系统配置: 删除广告类配置键 (原脚本删 6 个键, 键名被混淆, 此为候选集, 删不存在的键无副作用)
    [/\/system_service\/config\?/, obj => {
        if (!obj.data) return;
        for (let k of ["ads", "ad_config", "advert", "splash_ad", "popup_ad", "float_ad", "marketing"]) delete obj.data[k];
    }]
];

try {
    if (body) {
        for (let [re, fn] of ROUTES) {
            if (re.test(url)) {
                let obj = JSON.parse(body);
                fn(obj);
                body = JSON.stringify(obj);
                break;
            }
        }
    }
} catch (e) { console.log("[XHS] error: " + e); }

$done(body ? { body } : {});
