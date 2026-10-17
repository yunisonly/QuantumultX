/*
 * AmapNoAds.js — 高德地图净化脚本（本地版，配合 AmapNoAds.conf 使用）
 * 1. 打车 content_info 去营销
 * 2. POI 详情页去广告模块，移除租售房模块（rentSaleHouse / surroundOldSellHouse 及名称含 house 的模块），
 *    并移除“服务/推荐/评价/发现”标签及其模块（静态名单 TAB_MODULES + 标签栏动态读取）
 * 3. 搜索列表页去广告
 * 4. 酒店页面去广告
 *
 * 放在 QuantumultX/Scripts/ 目录下，规则里直接写 AmapNoAds.js。
 */

const url = $request.url;
let body = $response.body;

// 排查用：设为 true 后，日志会记录每次命中的接口、响应长度和时间
const DEBUG = true;
if (DEBUG) {
  console.log("AmapNoAds hit: " + url.split("?")[0] + " len=" + (body ? body.length : 0) + " t=" + Date.now());
}

// 租售房模块：精确名称 + 名称匹配（日志确认过 rentSaleHouse、surroundOldSellHouse）
const HOUSE_EXACT = ["rentSaleHouse", "surroundOldSellHouse"];
const HOUSE_PATTERN = /house/i;

// 要整体移除的详情页标签（按 title 精确匹配）。
// 标签位于 data.modules.anchor.data.items，每项含 title / anchor / module_list。
const REMOVE_TAB_TITLES = ["服务", "推荐", "评价", "发现"];

// 四个标签的 module_list 合集。详情接口每次点开小区会返回多个响应（首屏、完整、尾部），
// 只有完整响应里带标签栏，所以这份名单用于在每个响应里直接删除这些模块。
const TAB_MODULES = [
  // 服务
  "combinedBannerAbove", "enhanceCustomerServicePoiModule", "enhanceIMQuestions", "imModule",
  "CouponBanner", "common_coupon_bar", "houseOfficeBrandIntroduction", "houseOfficeNotice",
  "house_coupon", "rentsaleagencyv2", "rentsaleagencyv3", "platformCustomerCommonModule",
  "platformCustomerComplianceInfo", "house_price", "house_price_v2", "shopStructGift",
  "houseTrendContainer", "cpt_service_simple", "cpt_service_shop", "coupon_entrance",
  "commonGoodsShelf", "businessQualifications", "quickFlashSaleGoodsShelf",
  "serviceLineUpGoodsShelf", "serviceBookingGoodsShelf", "houseShelf", "newsellhouse",
  "oldsellhouse", "renthouse", "foreclosurehouse", "officerenthouse", "officesellhouse",
  "houseService", "houseAgentService", "rentsalehouse", "rentSaleHouse", "combinedBannerBelow",
  "poi_intercept", "surround_oldsellhouse", "surround_renthouse", "surround_rentoffice",
  "surround_selloffice", "surround_house_tab", "surroundOldSellHouse", "surroundRentHouse",
  "surroundRentOffice", "surroundSellOffice", "surroundHouseTab", "surroundHouseNearbyRecommend",
  "service_shop", "residentialOwnersVO", "residentialOwners", "realtorRealStep",
  "coupon_allowance", "house_cpt_coupon", "house_apart_info", "consultancy", "craftsman_entry",
  "shopPerson", "shopBasePerson", "legal_document", "poiDetailAdBookModule",
  "horizontalGoodsShelf", "notification", "shop_news", "shopNews", "subscription",
  "brand_introduction", "brand_story", "brandStory", "houseOfficeInfo", "houseOfficeService",
  "brand_service", "activity", "shopActivity", "shopStdActivity", "service_item", "mechanic_card",
  "houseEvaluationInfo", "surroundFacilityInfo", "surround_facility", "surround_facility_new",
  "nearby_house", "surroundEstateNearbyRecommend", "nearby_old_sell_estate",
  "nearby_new_house_estate", "hot_new_house_estate", "same_price_new_estate",
  "nearby_office_estate", "shopCaseInfoCard", "shopBaseCase", "first_surround_estate_tab",
  "second_surround_estate_tab", "house_cp_clues", "house_buying_agent", "house_rent_sale_agency",
  "similarShopRecommend", "yellowPageAdRecommendModule", "similarShelfRecommend",
  // 推荐
  "merchantInfoRecEntrance", "listBizRec_1", "listBizRec_2", "waistRecEntrance",
  "operationActivityRecommendedBanner", "carServiceCard",
  // 评价
  "scenic_helper", "contributor", "commonAiAgent", "wikiInfoBelow", "combineReviews", "evaluate",
  "evaluateVO", "societyPublicExperience", "impressionTabs", "commenttas",
  "travelGuideAndQaPrePosition", "reviews", "hotelGraphicDetail", "homestayGraphicDetail",
  "hotelFacilities", "hotelMustRead", "hotelSurround", "searchPlaMap", "scenic_voice",
  "human_traffic", "scenic_mustplay", "scenic_route_intelligent", "scenic_service",
  "scenic_parking", "scenic_knowledge", "collector_guide", "official_account",
  "question_answer_card", "travelGuideAndQa",
  // 发现
  "retainInfo", "matrix_banner", "parentBizRec", "parentPoiRecEntrance", "nearbyRecommendModule",
  "new_operation_banner", "newRelatedRecommends", "sameIndustryRecommendModule",
  "legSameIndustryRecEntrance", "commercialRecEntrance", "divergentRecommendModule", "everyOneToSee"
];

try {
  let obj = JSON.parse(body);

  // ==================== 1. 打车 content_info ====================
  if (url.includes("/car/order/content_info")) {
    if (obj?.data?.lubanData) {
      // 清空营销皮肤
      if (obj.data.lubanData.skin?.dataList) {
        obj.data.lubanData.skin.dataList = [];
      }

      // 过滤金刚位工具箱（只保留指定4个）
      if (obj.data.lubanData.kingToolBox?.dataList) {
        const keep = [
          "dache_toolbox_taxi_overseas_channel",
          "dache_toolbox_hitch",
          "dache_toolbox_GDIntercity",
          "dache_toolbox_chauffeur"
        ];

        obj.data.lubanData.kingToolBox.dataList =
          obj.data.lubanData.kingToolBox.dataList.filter(item => {
            return item?.biz?.id && keep.includes(item.biz.id);
          });
      }

      // 清除弹窗
      if (obj.data.lubanData.popup?.dataList) {
        obj.data.lubanData.popup.dataList = [];
      }

      // 清除右上角分享地址图标
      if (obj.data.lubanData?.toolMapBar) {
        obj.data.lubanData.toolMapBar = {};
      }

      // 清除底部banner
      if (obj.data.lubanData.banner?.dataList) {
        obj.data.lubanData.banner.dataList = [];
      }
    }

    if (obj?.data?.matrixData?.c3DiversionCard?.dataList?.length > 0) {
      // 附近景点推荐列表
      obj.data.matrixData.c3DiversionCard.dataList = [];
    }
  }

  // ==================== 2. POI 详情页去广告 + 去租售房 ====================
  else if (url.includes("/shield/search/poi/detail")) {
    if (obj?.data) {
      const adModules = [
        "CouponBanner",
        "CouponWidget",
        "CouponMiddleBanner",
        "CouponDetailMiddleBanner",
        "CouponFooterStickBanner",
        "CouponPopup",
        "MarketingGoods",
        "poiDetailNewBeltV2",
        "adStoreBigBannerModule",
        "shopStructGift",
        "quickFlashSaleGoodsShelf",
        "poiDetailHotSaleShelf",
        "group_buying_shelf",
        //"commonGoodsShelf",
        "kaProductMixServiceShelf",
        "packageShelf",
        "dayTripList",
        "scenic_ticket",
        "movie_info",
        "ktvBookingShelf",
        "carRentGroupBuy",
        "carRentNorm",
        "carRentalKaNorm",
        "standardGasPriceShelf",
        "housesShelf",
        "mallNews",
        "brand_shop_bar",
        "enhanceCustomerServicePoiModule",
        "imBottomGuide",
        "image_banner",
        "nearbyRecommendModule",
        "poiDetailWaterFeed",
        "poiDetailWaterFeedTitle",
        "similarShelfRecommend",
        "yellowPageAdRecommendModule",
        "similarShopRecommend",
        //"combineReviews",
        "poiDetailNote",
        "commonHkfMiniPortal",
        "activityRecommendation",
        "waterFallFeedTitle",
        "cityCardFeed",
        "hotelList",
        "CouponPush"
      ];

      // 所有要移除的模块名（广告 + 租售房），regions 等引用清理也用它
      const removeList = adModules.concat(HOUSE_EXACT, TAB_MODULES);
      const removedSet = new Set(removeList);

      // 删除广告模块与租售房模块
      if (obj.data.modules) {
        const houseRemoved = [];

        removeList.forEach(key => {
          if (obj.data.modules[key]) {
            delete obj.data.modules[key];
          }
        });

        // 名称含 house 的其他模块
        Object.keys(obj.data.modules).forEach(key => {
          if (HOUSE_PATTERN.test(key)) {
            delete obj.data.modules[key];
            removedSet.add(key);
            houseRemoved.push(key);
          }
        });

        if (houseRemoved.length) {
          console.log("amap_clean house removed: " + houseRemoved.join(", "));
        }
      }

      // 移除指定标签（服务/推荐/评价/发现）及其 module_list 里的模块
      // 标签栏位于 data.modules.anchor.data.items；同时出现在保留标签里的模块不删
      {
        const anchorMod = obj.data.modules && obj.data.modules.anchor;
        const items = anchorMod && anchorMod.data && anchorMod.data.items;

        if (Array.isArray(items)) {
          const dropNames = new Set();
          const keepNames = new Set();
          const keptItems = [];

          items.forEach(it => {
            const names = it && Array.isArray(it.module_list) ? it.module_list : [];
            const title = String((it && it.title) || "").trim();
            if (REMOVE_TAB_TITLES.includes(title)) {
              names.forEach(n => dropNames.add(n));
            } else {
              keptItems.push(it);
              names.forEach(n => keepNames.add(n));
            }
          });

          let tabRemoved = 0;
          dropNames.forEach(name => {
            if (keepNames.has(name)) return;
            removedSet.add(name);
            if (obj.data.modules[name]) {
              delete obj.data.modules[name];
              tabRemoved++;
            }
          });

          anchorMod.data.items = keptItems;

          // 标签全部移除后，标签栏本身也不需要了
          if (keptItems.length === 0) {
            delete obj.data.modules.anchor;
            removedSet.add("anchor");
          }

          console.log("amap_clean tabs removed: " + tabRemoved + " modules");
        }
      }

      // 清理 regions 引用
      if (obj.data.regions) {
        for (let region in obj.data.regions) {
          if (Array.isArray(obj.data.regions[region])) {
            obj.data.regions[region] =
              obj.data.regions[region].filter(
                item => !removedSet.has(item)
              );
          }
        }
      }

      // 清理优惠券刷新列表
      if (obj.data.meta?.vo_meta_info?.couponRefreshModules) {
        obj.data.meta.vo_meta_info.couponRefreshModules = [];
      }

      // 清理 half_hidden_modules
      if (obj.data.meta?.half_hidden_modules) {
        obj.data.meta.half_hidden_modules =
          obj.data.meta.half_hidden_modules.filter(
            item => !removedSet.has(item)
          );
      }

      // 处理地图 main_point
      if (obj.data.modules?.poiMapModule?.data?.map?.main_point) {
        const mainPoint =
          obj.data.modules.poiMapModule.data.map.main_point;

        // 删除营销纹理
        if (mainPoint.dynamic_texture) {
          delete mainPoint.dynamic_texture;
        }

        // 修改 card_id
        mainPoint.card_id = "normal_lottie";

        // 清空 logo
        mainPoint.logo = "";
      }
    }
  }

  // ==================== 3. 搜索列表页去广告 ====================
  else if (url.includes("/shield/search_poi/search/sp")) {
    if (obj?.data) {
      const searchAdModules = [
        "BrandBannerCard",
        "CustomerServiceAdEntrances",
        "PrecisionEntrances",
        "CouponBanner",
        "HeaderTipInfo",
        "HeaderTipSection"
      ];

      // 删除顶部广告模块
      if (obj.data.modules) {
        searchAdModules.forEach(key => {
          if (obj.data.modules[key]) {
            delete obj.data.modules[key];
          }
        });
      }

      // 清理 regions.listManage
      if (obj.data.regions?.listManage) {
        obj.data.regions.listManage =
          obj.data.regions.listManage.filter(
            item => !searchAdModules.includes(item)
          );
      }

      if (Array.isArray(obj?.data?.modules?.listResult?.data?.list) &&
        obj.data.modules.listResult.data.list.length > 0) {
        obj.data.modules.listResult.data.list = obj.data.modules.listResult.data.list.filter(
          item => item?.card_id === "PoiCardUniversal"
        );
      }
    }
  }

  // ==================== 4. 酒店页面广告 ====================
  else if (url.includes("/ws/info_bff/tradeUnionPortal")) {

    if (obj.data.template === "hotelUnionPortal") {
      if (obj.data.regions?.content && obj.data.regions.content.length > 0) {
        obj.data.regions.content = ["user_filter_card", "filter_tab", "hotel_list"];
      }
      if (obj.data.regions?.other && obj.data.regions.other.length > 0) {
        obj.data.regions.other = [];
      }
      if (obj.data.regions?.widget && obj.data.regions.widget.length > 0) {
        obj.data.regions.widget = ["operation_widget", "hotel_booking"];
      }

      //  酒店搜索框底部关键词提示
      if (obj?.data?.modules?.user_filter_card?.data) {
        delete obj.data.modules.user_filter_card.data.sug_items_data;
        obj.data.modules.user_filter_card.data.banner = {};
      }

      //  酒店页面的弹窗广告
      if (obj?.data?.modules?.CouponPopup) delete obj.data.modules.CouponPopup;
    }
  }

  if (DEBUG && url.includes("/shield/search/poi/detail") && obj?.data?.modules) {
    console.log("AmapNoAds modules left: " + Object.keys(obj.data.modules).join(",").slice(0, 600));
  }

  body = JSON.stringify(obj);
} catch (e) {
  console.log("脚本错误: " + e);
}

if (DEBUG) console.log("AmapNoAds done t=" + Date.now());
$done({ body });