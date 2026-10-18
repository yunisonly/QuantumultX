/*
 * AmapNoAds.js — 高德地图净化脚本（本地版，配合 AmapNoAds.conf 使用）
 *
 * 1. 打车 content_info：清营销、弹窗、底部 banner，金刚位只留 4 项
 * 2. POI 详情页：删广告、租售房和“服务/推荐/发现”模块（见 REMOVE_MODULES）；
 *    保留“评价”、百科、楼层导航等其余内容；标签栏只保留仍指向现存模块的标签
 * 3. 搜索列表页去广告
 * 4. 酒店页面去广告
 *
 * 放在 QuantumultX/Scripts/ 目录下，规则里直接写 AmapNoAds.js。
 * DEBUG 设为 true 时，日志会列出每个详情响应处理后剩下的模块名和保留的标签。
 */

const DEBUG = false;

const url = $request.url;
let body = $response.body;

// 要删除的模块名（纯名字清单，按作用分组）。新出现的模块名要手动补充到这里。
const REMOVE_MODULES = new Set([
  // 优惠券、营销与活动入口
  "CouponBanner", "CouponWidget", "CouponMiddleBanner", "CouponDetailMiddleBanner",
  "CouponFooterStickBanner", "CouponPopup", "CouponPush", "common_coupon_bar",
  "coupon_entrance", "coupon_allowance", "MarketingGoods", "poiDetailNewBeltV2",
  "adStoreBigBannerModule", "poiDetailAdBookModule", "image_banner", "combinedBannerAbove",
  "combinedBannerBelow", "matrix_banner", "new_operation_banner",
  "operationActivityRecommendedBanner", "activityRecommendation", "activity",
  "shopActivity", "shopStdActivity", "retainInfo", "brand_shop_bar", "mallNews",
  "shop_news", "shopNews", "notification", "subscription", "shopStructGift",
  "commonHkfMiniPortal",
  // 客服、咨询与免责声明
  "enhanceCustomerServicePoiModule", "enhanceIMQuestions", "imModule", "imBottomGuide",
  "platformCustomerCommonModule", "platformCustomerComplianceInfo", "consultancy",
  "legal_document", "poi_intercept",
  // 推荐与信息流
  "poiDetailWaterFeed", "poiDetailWaterFeedTitle", "waterFallFeedTitle", "cityCardFeed",
  "nearbyRecommendModule", "similarShelfRecommend", "yellowPageAdRecommendModule",
  "similarShopRecommend", "merchantInfoRecEntrance", "listBizRec_1", "listBizRec_2",
  "waistRecEntrance", "parentBizRec", "parentPoiRecEntrance", "newRelatedRecommends",
  "sameIndustryRecommendModule", "legSameIndustryRecEntrance", "commercialRecEntrance",
  "divergentRecommendModule", "everyOneToSee", "poiDetailNote",
  // 商家服务与品牌介绍
  "cpt_service_simple", "cpt_service_shop", "service_shop", "service_item",
  "mechanic_card", "shopPerson", "shopBasePerson", "craftsman_entry", "brand_introduction",
  "brand_story", "brandStory", "brand_service", "businessQualifications",
  "shopCaseInfoCard", "shopBaseCase",
  // 周边配套、房产周边与业主信息
  "surroundFacilityInfo", "surround_facility", "surround_facility_new",
  "surroundEstateNearbyRecommend", "nearby_old_sell_estate", "same_price_new_estate",
  "nearby_office_estate", "first_surround_estate_tab", "second_surround_estate_tab",
  "surround_rentoffice", "surround_selloffice", "surroundRentOffice", "surroundSellOffice",
  "residentialOwners", "residentialOwnersVO", "rentsaleagencyv2", "rentsaleagencyv3",
  "realtorRealStep",
  // 租售房
  "housesShelf", "houseOfficeBrandIntroduction", "houseOfficeNotice", "house_coupon",
  "house_price", "house_price_v2", "houseTrendContainer", "houseShelf", "newsellhouse",
  "oldsellhouse", "renthouse", "foreclosurehouse", "officerenthouse", "officesellhouse",
  "houseService", "houseAgentService", "rentsalehouse", "rentSaleHouse",
  "surround_oldsellhouse", "surround_renthouse", "surround_house_tab",
  "surroundOldSellHouse", "surroundRentHouse", "surroundHouseTab",
  "surroundHouseNearbyRecommend", "house_cpt_coupon", "house_apart_info",
  "houseOfficeInfo", "houseOfficeService", "houseEvaluationInfo", "nearby_house",
  "nearby_new_house_estate", "hot_new_house_estate", "house_cp_clues",
  "house_buying_agent", "house_rent_sale_agency", "newHouseCptCoupon"
]);

// 标签栏里要整体移除的标签（按 title 匹配）；“评价”不在其中
const REMOVE_TABS = ["服务", "推荐", "发现"];

// 标签指向的模块名（标签的 anchor 字段，字符串或数组）
const tabTargets = tab => [].concat(tab.anchor || []).filter(x => typeof x === "string");

try {
  const obj = JSON.parse(body);
  const data = obj && obj.data;

  if (DEBUG) console.log("AmapNoAds hit: " + url.split("?")[0] + " len=" + (body ? body.length : 0));

  if (url.includes("/car/order/content_info")) {
    carOrder(obj);
  } else if (url.includes("/shield/search/poi/detail")) {
    if (data) poiDetail(data);
  } else if (url.includes("/shield/search_poi/search/sp")) {
    if (data) searchList(data);
  } else if (url.includes("/ws/info_bff/tradeUnionPortal")) {
    if (data) hotel(data);
  }

  body = JSON.stringify(obj);
} catch (e) {
  console.log("脚本错误: " + e);
}

$done({ body });

// ==================== 1. 打车 content_info ====================
function carOrder(obj) {
  const luban = obj?.data?.lubanData;
  if (luban) {
    if (luban.skin?.dataList) luban.skin.dataList = [];          // 营销皮肤
    if (luban.popup?.dataList) luban.popup.dataList = [];        // 弹窗
    if (luban.banner?.dataList) luban.banner.dataList = [];      // 底部 banner
    if (luban.toolMapBar) luban.toolMapBar = {};                 // 右上角分享地址图标

    // 金刚位工具箱只保留指定 4 个
    const keep = [
      "dache_toolbox_taxi_overseas_channel",
      "dache_toolbox_hitch",
      "dache_toolbox_GDIntercity",
      "dache_toolbox_chauffeur"
    ];
    if (luban.kingToolBox?.dataList) {
      luban.kingToolBox.dataList = luban.kingToolBox.dataList.filter(
        item => item?.biz?.id && keep.includes(item.biz.id)
      );
    }
  }

  // 附近景点推荐列表
  if (obj?.data?.matrixData?.c3DiversionCard?.dataList?.length > 0) {
    obj.data.matrixData.c3DiversionCard.dataList = [];
  }
}

// ==================== 2. POI 详情页 ====================
function poiDetail(data) {
  const mods = data.modules;
  const extra = new Set();                       // 运行时发现、也要删除的模块名
  const gone = name => REMOVE_MODULES.has(name) || extra.has(name);

  // 标签栏位于 data.modules.anchor.data.items
  const tabs = mods?.anchor?.data?.items;
  const tabList = Array.isArray(tabs) ? tabs.filter(t => t && typeof t === "object") : [];

  // 被移除标签里列出的模块一并删除；同时属于保留标签的模块不删
  const keepNames = new Set();
  tabList.forEach(t => {
    if (!REMOVE_TABS.includes(String(t.title).trim())) tabTargets(t).forEach(n => keepNames.add(n));
  });
  tabList.forEach(t => {
    if (REMOVE_TABS.includes(String(t.title).trim())) {
      tabTargets(t).forEach(n => { if (!keepNames.has(n)) extra.add(n); });
    }
  });

  // 删除模块
  if (mods) {
    Object.keys(mods).forEach(key => { if (gone(key)) delete mods[key]; });
  }

  // 标签栏：去掉被移除的标签，以及指向的模块全部已删的标签；只剩 0~1 个标签时整个标签栏不要
  if (Array.isArray(tabs)) {
    const alive = tabList.filter(t => {
      if (REMOVE_TABS.includes(String(t.title).trim())) return false;
      const targets = tabTargets(t);
      return targets.length === 0 || !targets.every(gone);
    });
    if (alive.length <= 1) {
      delete mods.anchor;
      extra.add("anchor");
    } else {
      mods.anchor.data.items = alive;
    }
    if (DEBUG) {
      console.log("AmapNoAds tabs kept: " +
        alive.map(t => t.title + "→" + tabTargets(t).join("/")).join(" | ").slice(0, 400));
    }
  }

  // regions、half_hidden_modules 里不再引用已删模块
  const notGone = name => !gone(name);
  if (data.regions) {
    Object.keys(data.regions).forEach(k => {
      if (Array.isArray(data.regions[k])) data.regions[k] = data.regions[k].filter(notGone);
    });
  }
  if (data.meta?.half_hidden_modules) {
    data.meta.half_hidden_modules = data.meta.half_hidden_modules.filter(notGone);
  }
  if (data.meta?.vo_meta_info?.couponRefreshModules) {
    data.meta.vo_meta_info.couponRefreshModules = [];
  }

  // 地图定位点：去掉营销纹理和 logo
  const mp = mods?.poiMapModule?.data?.map?.main_point;
  if (mp) {
    delete mp.dynamic_texture;
    mp.card_id = "normal_lottie";
    mp.logo = "";
  }

  if (DEBUG) console.log("AmapNoAds modules left: " + Object.keys(mods || {}).join(",").slice(0, 600));
}

// ==================== 3. 搜索列表页 ====================
function searchList(data) {
  const adModules = [
    "BrandBannerCard",
    "CustomerServiceAdEntrances",
    "PrecisionEntrances",
    "CouponBanner",
    "HeaderTipInfo",
    "HeaderTipSection"
  ];

  if (data.modules) {
    adModules.forEach(key => { delete data.modules[key]; });
  }
  if (data.regions?.listManage) {
    data.regions.listManage = data.regions.listManage.filter(item => !adModules.includes(item));
  }

  // 结果列表只保留普通地点卡片
  const list = data.modules?.listResult?.data?.list;
  if (Array.isArray(list) && list.length > 0) {
    data.modules.listResult.data.list = list.filter(item => item?.card_id === "PoiCardUniversal");
  }
}

// ==================== 4. 酒店页面 ====================
function hotel(data) {
  if (data.template !== "hotelUnionPortal") return;

  const regions = data.regions;
  if (regions?.content?.length > 0) regions.content = ["user_filter_card", "filter_tab", "hotel_list"];
  if (regions?.other?.length > 0) regions.other = [];
  if (regions?.widget?.length > 0) regions.widget = ["operation_widget", "hotel_booking"];

  // 搜索框底部关键词提示
  const filter = data.modules?.user_filter_card?.data;
  if (filter) {
    delete filter.sug_items_data;
    filter.banner = {};
  }

  // 弹窗广告
  if (data.modules?.CouponPopup) delete data.modules.CouponPopup;
}
