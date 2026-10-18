const API_BASE_URL = '/api';
let currentCityCode = '';
let currentWeatherData = null;
let searchTimeout = null;
let selectedIndex = -1;
let currentSearchResults = [];

// 城市数据库 - 支持拼音首字母搜索
const CITY_DATABASE = [
    // 直辖市
    { cityCode: '101010100', cityName: '北京', province: '北京', pinyin: 'beijing', py: 'bj' },
    { cityCode: '101020100', cityName: '上海', province: '上海', pinyin: 'shanghai', py: 'sh' },
    { cityCode: '101030100', cityName: '天津', province: '天津', pinyin: 'tianjin', py: 'tj' },
    { cityCode: '101040100', cityName: '重庆', province: '重庆', pinyin: 'chongqing', py: 'cq' },
    // 广东
    { cityCode: '101280101', cityName: '广州', province: '广东', pinyin: 'guangzhou', py: 'gz' },
    { cityCode: '101280601', cityName: '深圳', province: '广东', pinyin: 'shenzhen', py: 'sz' },
    { cityCode: '101280401', cityName: '珠海', province: '广东', pinyin: 'zhuhai', py: 'zh' },
    { cityCode: '101280701', cityName: '汕头', province: '广东', pinyin: 'shantou', py: 'st' },
    { cityCode: '101281601', cityName: '东莞', province: '广东', pinyin: 'dongguan', py: 'dg' },
    { cityCode: '101281701', cityName: '中山', province: '广东', pinyin: 'zhongshan', py: 'zs' },
    { cityCode: '101281201', cityName: '佛山', province: '广东', pinyin: 'foshan', py: 'fs' },
    { cityCode: '101280201', cityName: '韶关', province: '广东', pinyin: 'shaoguan', py: 'sg' },
    // 江苏
    { cityCode: '101190101', cityName: '南京', province: '江苏', pinyin: 'nanjing', py: 'nj' },
    { cityCode: '101190401', cityName: '苏州', province: '江苏', pinyin: 'suzhou', py: 'sz' },
    { cityCode: '101190201', cityName: '无锡', province: '江苏', pinyin: 'wuxi', py: 'wx' },
    { cityCode: '101190501', cityName: '常州', province: '江苏', pinyin: 'changzhou', py: 'cz' },
    { cityCode: '101191101', cityName: '南通', province: '江苏', pinyin: 'nantong', py: 'nt' },
    { cityCode: '101190601', cityName: '扬州', province: '江苏', pinyin: 'yangzhou', py: 'yz' },
    // 浙江
    { cityCode: '101210101', cityName: '杭州', province: '浙江', pinyin: 'hangzhou', py: 'hz' },
    { cityCode: '101210401', cityName: '宁波', province: '浙江', pinyin: 'ningbo', py: 'nb' },
    { cityCode: '101210701', cityName: '温州', province: '浙江', pinyin: 'wenzhou', py: 'wz' },
    { cityCode: '101210501', cityName: '绍兴', province: '浙江', pinyin: 'shaoxing', py: 'sx' },
    { cityCode: '101210201', cityName: '嘉兴', province: '浙江', pinyin: 'jiaxing', py: 'jx' },
    // 山东
    { cityCode: '101120101', cityName: '济南', province: '山东', pinyin: 'jinan', py: 'jn' },
    { cityCode: '101120201', cityName: '青岛', province: '山东', pinyin: 'qingdao', py: 'qd' },
    { cityCode: '101120501', cityName: '烟台', province: '山东', pinyin: 'yantai', py: 'yt' },
    { cityCode: '101120301', cityName: '淄博', province: '山东', pinyin: 'zibo', py: 'zb' },
    { cityCode: '101120601', cityName: '潍坊', province: '山东', pinyin: 'weifang', py: 'wf' },
    // 四川
    { cityCode: '101270101', cityName: '成都', province: '四川', pinyin: 'chengdu', py: 'cd' },
    { cityCode: '101270401', cityName: '绵阳', province: '四川', pinyin: 'mianyang', py: 'my' },
    { cityCode: '101270901', cityName: '宜宾', province: '四川', pinyin: 'yibin', py: 'yb' },
    { cityCode: '101270201', cityName: '自贡', province: '四川', pinyin: 'zigong', py: 'zg' },
    // 湖北
    { cityCode: '101200101', cityName: '武汉', province: '湖北', pinyin: 'wuhan', py: 'wh' },
    { cityCode: '101200901', cityName: '宜昌', province: '湖北', pinyin: 'yichang', py: 'yc' },
    { cityCode: '101200201', cityName: '襄阳', province: '湖北', pinyin: 'xiangyang', py: 'xy' },
    // 湖南
    { cityCode: '101250101', cityName: '长沙', province: '湖南', pinyin: 'changsha', py: 'cs' },
    { cityCode: '101250201', cityName: '株洲', province: '湖南', pinyin: 'zhuzhou', py: 'zz' },
    { cityCode: '101251101', cityName: '张家界', province: '湖南', pinyin: 'zhangjiajie', py: 'zjj' },
    // 福建
    { cityCode: '101230101', cityName: '福州', province: '福建', pinyin: 'fuzhou', py: 'fz' },
    { cityCode: '101230201', cityName: '厦门', province: '福建', pinyin: 'xiamen', py: 'xm' },
    { cityCode: '101230301', cityName: '泉州', province: '福建', pinyin: 'quanzhou', py: 'qz' },
    // 河南
    { cityCode: '101180101', cityName: '郑州', province: '河南', pinyin: 'zhengzhou', py: 'zz' },
    { cityCode: '101180201', cityName: '洛阳', province: '河南', pinyin: 'luoyang', py: 'ly' },
    { cityCode: '101180901', cityName: '开封', province: '河南', pinyin: 'kaifeng', py: 'kf' },
    // 河北
    { cityCode: '101090101', cityName: '石家庄', province: '河北', pinyin: 'shijiazhuang', py: 'sjz' },
    { cityCode: '101090201', cityName: '保定', province: '河北', pinyin: 'baoding', py: 'bd' },
    { cityCode: '101091101', cityName: '唐山', province: '河北', pinyin: 'tangshan', py: 'ts' },
    // 安徽
    { cityCode: '101220101', cityName: '合肥', province: '安徽', pinyin: 'hefei', py: 'hf' },
    { cityCode: '101220201', cityName: '芜湖', province: '安徽', pinyin: 'wuhu', py: 'wh' },
    // 辽宁
    { cityCode: '101070101', cityName: '沈阳', province: '辽宁', pinyin: 'shenyang', py: 'sy' },
    { cityCode: '101070201', cityName: '大连', province: '辽宁', pinyin: 'dalian', py: 'dl' },
    // 吉林
    { cityCode: '101060101', cityName: '长春', province: '吉林', pinyin: 'changchun', py: 'cc' },
    { cityCode: '101060201', cityName: '吉林', province: '吉林', pinyin: 'jilin', py: 'jl' },
    // 黑龙江
    { cityCode: '101050101', cityName: '哈尔滨', province: '黑龙江', pinyin: 'haerbin', py: 'heb' },
    { cityCode: '101050201', cityName: '齐齐哈尔', province: '黑龙江', pinyin: 'qiqihaer', py: 'qqhe' },
    // 江西
    { cityCode: '101240101', cityName: '南昌', province: '江西', pinyin: 'nanchang', py: 'nc' },
    { cityCode: '101240201', cityName: '九江', province: '江西', pinyin: 'jiujiang', py: 'jj' },
    // 山西
    { cityCode: '101100101', cityName: '太原', province: '山西', pinyin: 'taiyuan', py: 'ty' },
    { cityCode: '101100201', cityName: '大同', province: '山西', pinyin: 'datong', py: 'dt' },
    // 陕西
    { cityCode: '101110101', cityName: '西安', province: '陕西', pinyin: 'xian', py: 'xa' },
    { cityCode: '101110201', cityName: '宝鸡', province: '陕西', pinyin: 'baoji', py: 'bj' },
    // 云南
    { cityCode: '101290101', cityName: '昆明', province: '云南', pinyin: 'kunming', py: 'km' },
    { cityCode: '101290201', cityName: '大理', province: '云南', pinyin: 'dali', py: 'dl' },
    { cityCode: '101291401', cityName: '丽江', province: '云南', pinyin: 'lijiang', py: 'lj' },
    // 贵州
    { cityCode: '101260101', cityName: '贵阳', province: '贵州', pinyin: 'guiyang', py: 'gy' },
    { cityCode: '101260201', cityName: '遵义', province: '贵州', pinyin: 'zunyi', py: 'zy' },
    // 广西
    { cityCode: '101300101', cityName: '南宁', province: '广西', pinyin: 'nanning', py: 'nn' },
    { cityCode: '101300501', cityName: '桂林', province: '广西', pinyin: 'guilin', py: 'gl' },
    { cityCode: '101300201', cityName: '柳州', province: '广西', pinyin: 'liuzhou', py: 'lz' },
    // 甘肃
    { cityCode: '101160101', cityName: '兰州', province: '甘肃', pinyin: 'lanzhou', py: 'lz' },
    { cityCode: '101161401', cityName: '敦煌', province: '甘肃', pinyin: 'dunhuang', py: 'dh' },
    // 新疆
    { cityCode: '101130101', cityName: '乌鲁木齐', province: '新疆', pinyin: 'wulumuqi', py: 'wlmq' },
    // 内蒙古
    { cityCode: '101080101', cityName: '呼和浩特', province: '内蒙古', pinyin: 'huhehaote', py: 'hhht' },
    { cityCode: '101080201', cityName: '包头', province: '内蒙古', pinyin: 'baotou', py: 'bt' },
    // 宁夏
    { cityCode: '101170101', cityName: '银川', province: '宁夏', pinyin: 'yinchuan', py: 'yc' },
    // 青海
    { cityCode: '101150101', cityName: '西宁', province: '青海', pinyin: 'xining', py: 'xn' },
    // 海南
    { cityCode: '101310101', cityName: '海口', province: '海南', pinyin: 'haikou', py: 'hk' },
    { cityCode: '101310201', cityName: '三亚', province: '海南', pinyin: 'sanya', py: 'sy' },
    // 西藏
    { cityCode: '101140101', cityName: '拉萨', province: '西藏', pinyin: 'lasa', py: 'ls' },
    // 台湾
    { cityCode: '101340101', cityName: '台北', province: '台湾', pinyin: 'taibei', py: 'tb' },
    // 香港澳门
    { cityCode: '101320101', cityName: '香港', province: '香港', pinyin: 'xianggang', py: 'xg' },
    { cityCode: '101330101', cityName: '澳门', province: '澳门', pinyin: 'aomen', py: 'am' },
];

// 热门城市
const HOT_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '重庆'];

const WEATHER_ICONS = {
    '晴': { day: '☀️', night: '🌙' },
    '多云': { day: '⛅', night: '⛅' },
    '阴': { day: '☁️', night: '☁️' },
    '小雨': { day: '🌧️', night: '🌧️' },
    '中雨': { day: '🌧️', night: '🌧️' },
    '大雨': { day: '🌧️', night: '🌧️' },
    '暴雨': { day: '🌧️', night: '🌧️' },
    '雷阵雨': { day: '⛈️', night: '⛈️' },
    '雷暴': { day: '⛈️', night: '⛈️' },
    '小雪': { day: '❄️', night: '❄️' },
    '中雪': { day: '❄️', night: '❄️' },
    '大雪': { day: '❄️', night: '❄️' },
    '雾': { day: '🌫️', night: '🌫️' },
    '霾': { day: '🌫️', night: '🌫️' },
    '风': { day: '💨', night: '💨' }
};

const RISK_ICONS = {
    '高温': '🔥',
    '雷电': '⚡',
    '大风': '🌪️',
    '暴雨': '🌊',
    '低温': '🥶',
    '大雾': '🌫️',
    '冰雹': '🧊',
    '暴雪': '❄️',
    '干旱': '🏜️',
    '紫外线': '☀️'
};

function apiFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    return fetch(url, { ...options, headers });
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return false;
    }
    const username = localStorage.getItem('username');
    if (username) {
        const displays = ['usernameDisplay', 'dropdownUsername'];
        displays.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = username;
        });
        const avatar = document.getElementById('userAvatar');
        if (avatar && username) {
            avatar.textContent = username.charAt(0);
        }
    }
    return true;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
}

function isNightTime() {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 6;
}

function getWeatherIcon(weatherText) {
    if (!weatherText) return '☀️';
    
    const isNight = isNightTime();
    
    for (const [key, icons] of Object.entries(WEATHER_ICONS)) {
        if (weatherText.includes(key)) {
            return isNight ? icons.night : icons.day;
        }
    }
    
    return isNight ? '🌙' : '☀️';
}

function getRiskIcon(riskName) {
    if (!riskName) return '⚠️';
    for (const [key, icon] of Object.entries(RISK_ICONS)) {
        if (riskName.includes(key)) {
            return icon;
        }
    }
    return '⚠️';
}

function getRiskLevelClass(riskLevel) {
    if (!riskLevel) return 'tip';
    const level = riskLevel.toString().toLowerCase();
    if (level.includes('高') || level.includes('严重') || level === 'high') return 'high';
    if (level.includes('中') || level === 'medium' || level === 'moderate') return 'medium';
    if (level.includes('低') || level === 'low') return 'low';
    return 'tip';
}

function getRiskLevelText(riskLevel) {
    if (!riskLevel) return '提示';
    const level = riskLevel.toString().toLowerCase();
    if (level.includes('高') || level.includes('严重') || level === 'high') return '高危';
    if (level.includes('中') || level === 'medium' || level === 'moderate') return '中度';
    if (level.includes('低') || level === 'low') return '低危';
    return '提示';
}

function initCitySearch() {
    const searchInput = document.getElementById('citySearchInput');
    const searchDropdown = document.getElementById('citySearchDropdown');
    const clearBtn = document.getElementById('searchClearBtn');

    // 输入实时搜索
    searchInput.addEventListener('input', function() {
        const keyword = this.value.trim();
        
        // 清除按钮显示控制
        if (keyword.length > 0) {
            clearBtn.classList.add('show');
        } else {
            clearBtn.classList.remove('show');
        }
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        if (keyword.length < 1) {
            // 空输入时显示热门城市
            showHotCities();
            return;
        }

        // 使用本地数据库实时过滤（支持拼音首字母）
        searchTimeout = setTimeout(() => {
            filterCitiesLocal(keyword);
        }, 100);
    });

    // 聚焦时显示下拉
    searchInput.addEventListener('focus', function() {
        const keyword = this.value.trim();
        if (keyword.length >= 1) {
            filterCitiesLocal(keyword);
        } else {
            showHotCities();
        }
    });

    // 清除按钮
    clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        searchInput.value = '';
        clearBtn.classList.remove('show');
        searchDropdown.classList.remove('show');
        searchInput.focus();
    });

    // 键盘导航
    searchInput.addEventListener('keydown', function(e) {
        const items = searchDropdown.querySelectorAll('.weather-search-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelectedItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelectedItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && currentSearchResults[selectedIndex]) {
                const city = currentSearchResults[selectedIndex];
                selectCity(city.cityCode, city.cityName);
            }
        } else if (e.key === 'Escape') {
            searchDropdown.classList.remove('show');
        }
    });

    // 点击外部关闭下拉
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.weather-search-box')) {
            searchDropdown.classList.remove('show');
            selectedIndex = -1;
        }
    });
}

function updateSelectedItem(items) {
    items.forEach((item, idx) => {
        if (idx === selectedIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

// 本地城市过滤（支持中文、拼音全拼、拼音首字母）
function filterCitiesLocal(keyword) {
    const searchDropdown = document.getElementById('citySearchDropdown');
    const keywordLower = keyword.toLowerCase();
    
    const results = CITY_DATABASE.filter(city => {
        const nameMatch = city.cityName.includes(keyword);
        const pinyinMatch = city.pinyin.toLowerCase().includes(keywordLower);
        const pyMatch = city.py.toLowerCase().includes(keywordLower);
        const provMatch = city.province.includes(keyword);
        return nameMatch || pinyinMatch || pyMatch || provMatch;
    }).slice(0, 8); // 最多8条
    
    currentSearchResults = results;
    selectedIndex = -1;
    
    if (results.length === 0) {
        searchDropdown.innerHTML = `
            <div class="weather-search-hot-tags">
                <div class="weather-search-hot-title">🔥 热门城市</div>
                <div class="weather-search-hot-list">
                    ${HOT_CITIES.map(name => `<span class="weather-search-hot-tag" onclick="selectHotCity('${name}')">${name}</span>`).join('')}
                </div>
            </div>
            <div class="weather-search-item" style="justify-content: center; color: var(--pc-text-tertiary);">
                <span>未找到"${keyword}"相关城市</span>
            </div>
        `;
        searchDropdown.classList.add('show');
        return;
    }

    const itemsHtml = results.map((city, index) => {
        const displayName = highlightMatch(city.cityName, keyword);
        return `
            <div class="weather-search-item ${index === 0 ? 'active' : ''}" 
                 onclick="selectCity('${city.cityCode}', '${city.cityName}')"
                 onmouseenter="selectedIndex = ${index}; this.parentElement.querySelectorAll('.weather-search-item').forEach((el,i) => el.classList.toggle('active', i === ${index}));">
                <div class="weather-search-item-name">${displayName}</div>
                <div class="weather-search-item-prov">${city.province}</div>
            </div>
        `;
    }).join('');
    
    // 如果结果少于8条，添加热门城市
    const hotSection = results.length < 5 ? `
        <div class="weather-search-hot-tags" style="border-top: 1px solid var(--pc-border-lightest); border-bottom: none;">
            <div class="weather-search-hot-title">🔥 热门城市</div>
            <div class="weather-search-hot-list">
                ${HOT_CITIES.filter(n => !results.some(r => r.cityName === n)).slice(0, 6).map(name => 
                    `<span class="weather-search-hot-tag" onclick="selectHotCity('${name}')">${name}</span>`
                ).join('')}
            </div>
        </div>
    ` : '';
    
    searchDropdown.innerHTML = itemsHtml + hotSection;
    searchDropdown.classList.add('show');
    
    if (results.length > 0) {
        selectedIndex = 0;
    }
}

// 高亮匹配文字
function highlightMatch(text, keyword) {
    if (!keyword) return text;
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const index = lowerText.indexOf(lowerKeyword);
    if (index >= 0) {
        return text.substring(0, index) + 
               '<span class="weather-search-item-match">' + text.substring(index, index + keyword.length) + '</span>' + 
               text.substring(index + keyword.length);
    }
    // 拼音匹配的情况不高亮
    return text;
}

// 显示热门城市
function showHotCities() {
    const searchDropdown = document.getElementById('citySearchDropdown');
    searchDropdown.innerHTML = `
        <div class="weather-search-hot-tags">
            <div class="weather-search-hot-title">🔥 热门城市</div>
            <div class="weather-search-hot-list">
                ${HOT_CITIES.map(name => `<span class="weather-search-hot-tag" onclick="selectHotCity('${name}')">${name}</span>`).join('')}
            </div>
        </div>
    `;
    searchDropdown.classList.add('show');
    currentSearchResults = [];
    selectedIndex = -1;
}

// 选择热门城市
function selectHotCity(cityName) {
    const city = CITY_DATABASE.find(c => c.cityName === cityName);
    if (city) {
        selectCity(city.cityCode, city.cityName);
    }
}

async function searchCities(keyword) {
    // 保留API搜索作为备用（当本地数据库无法满足时）
    const searchDropdown = document.getElementById('citySearchDropdown');
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/weather/search?keyword=${encodeURIComponent(keyword)}`);
        
        if (!response.ok) {
            throw new Error('搜索失败');
        }
        
        const cities = await response.json();
        
        if (!cities || cities.length === 0) {
            filterCitiesLocal(keyword);
            return;
        }

        currentSearchResults = cities.slice(0, 8);
        
        searchDropdown.innerHTML = currentSearchResults.map((city, index) => `
            <div class="weather-search-item ${index === 0 ? 'active' : ''}" 
                 onclick="selectCity('${city.cityCode}', '${city.cityName}')">
                <div class="weather-search-item-name">${city.cityName}</div>
                <div class="weather-search-item-prov">${city.province || ''}</div>
            </div>
        `).join('');
        
        searchDropdown.classList.add('show');
        selectedIndex = 0;
    } catch (error) {
        // API失败时使用本地搜索
        filterCitiesLocal(keyword);
    }
}

function selectCity(cityCode, cityName) {
    const searchInput = document.getElementById('citySearchInput');
    const searchDropdown = document.getElementById('citySearchDropdown');
    const clearBtn = document.getElementById('searchClearBtn');
    
    searchInput.value = cityName;
    searchDropdown.classList.remove('show');
    clearBtn.classList.add('show');
    
    currentCityCode = cityCode;
    loadWeatherData(cityCode);
}

async function loadWeatherData(cityCode) {
    if (!cityCode) return;

    showLoadingStates();

    try {
        const response = await apiFetch(`${API_BASE_URL}/weather/report/${cityCode}`);
        
        if (!response.ok) {
            throw new Error('获取天气数据失败');
        }
        
        const data = await response.json();
        currentWeatherData = data;
        
        renderWeatherOverview(data);
        renderForecast(data);
        renderRisks(data);
        checkHighRiskAlert(data);
        
    } catch (error) {
        console.error('加载天气数据失败:', error);
        showErrorStates(error.message || '加载失败，请点击重试');
    }
}

function showLoadingStates() {
    const forecastList = document.getElementById('forecastList');
    const riskContainer = document.getElementById('riskAssessmentContainer');
    
    forecastList.innerHTML = `
        <div class="weather-loading">
            <div class="pc-loader">
                <div class="pc-loader-ring"></div>
                <div class="pc-loader-ring"></div>
                <div class="pc-loader-ring"></div>
            </div>
            <div class="weather-loading-text">正在加载天气数据...</div>
        </div>
    `;
    
    riskContainer.innerHTML = `
        <div class="weather-loading">
            <div class="pc-loader">
                <div class="pc-loader-ring"></div>
                <div class="pc-loader-ring"></div>
                <div class="pc-loader-ring"></div>
            </div>
            <div class="weather-loading-text">正在分析气象风险...</div>
        </div>
    `;
}

function showErrorStates(message) {
    const forecastList = document.getElementById('forecastList');
    const riskContainer = document.getElementById('riskAssessmentContainer');
    
    const errorHtml = `
        <div class="weather-error">
            <div class="weather-error-icon">😔</div>
            <div class="weather-error-text">${message}</div>
            <button class="pc-btn pc-btn-primary" onclick="refreshWeather()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                重新加载
            </button>
        </div>
    `;
    
    forecastList.innerHTML = errorHtml;
    riskContainer.innerHTML = errorHtml;
}

function renderWeatherOverview(data) {
    const cityInfo = data.cityInfo || {};
    const current = data.current || {};
    
    document.getElementById('currentCityName').textContent = cityInfo.cityName || '未知城市';
    document.getElementById('updateTime').textContent = `更新时间: ${current.updateTime || '--'}`;
    document.getElementById('weatherMainIcon').textContent = getWeatherIcon(current.weatherText);
    document.getElementById('currentTemp').textContent = current.temp || '--';
    document.getElementById('weatherDesc').textContent = current.weatherText || '--';
    document.getElementById('humidityValue').textContent = current.shidu || '--%';
    document.getElementById('windScaleValue').textContent = (current.windScale || '--') + '级';
    document.getElementById('windDirValue').textContent = current.windDir || '--';
    document.getElementById('airQualityValue').textContent = current.quality || '--';
    document.getElementById('sunriseValue').textContent = current.sunrise || '--';
    document.getElementById('sunsetValue').textContent = current.sunset || '--';
    document.getElementById('pm25Value').textContent = current.pm25 != null ? current.pm25 + ' μg/m³' : '--';
    document.getElementById('pm10Value').textContent = current.pm10 != null ? current.pm10 + ' μg/m³' : '--';
    document.getElementById('ganmaoValue').textContent = current.ganmao ? current.ganmao.substring(0, 8) + '...' : '--';
    document.getElementById('aqiValue').textContent = current.aqi != null ? current.aqi : '--';
}

function getAqiLevel(aqi) {
    if (!aqi) return { text: '--', class: '' };
    const val = parseInt(aqi);
    if (val <= 50) return { text: '优', class: 'good' };
    if (val <= 100) return { text: '良', class: 'good' };
    if (val <= 150) return { text: '轻度', class: 'moderate' };
    if (val <= 200) return { text: '中度', class: 'unhealthy' };
    if (val <= 300) return { text: '重度', class: 'very-unhealthy' };
    return { text: '严重', class: 'very-unhealthy' };
}

function renderForecast(data) {
    const forecastList = document.getElementById('forecastList');
    const forecast = data.forecast || [];
    
    if (!forecast || forecast.length === 0) {
        forecastList.innerHTML = `
            <div class="weather-error">
                <div class="weather-error-icon">📋</div>
                <div class="weather-error-text">暂无预报数据</div>
            </div>
        `;
        return;
    }

    forecastList.innerHTML = forecast.map((day, index) => {
        const dateStr = day.ymd || day.date || '';
        let dateLabel = dateStr;
        if (index === 0) dateLabel = '今天';
        else if (index === 1) dateLabel = '明天';
        else if (index === 2) dateLabel = '后天';
        
        const dayWeather = day.dayWeather || day.weather || '--';
        const nightWeather = day.nightWeather || '';
        const weatherText = nightWeather ? `${dayWeather}转${nightWeather}` : dayWeather;
        
        const tempMax = day.tempMax || day.high || '--';
        const tempMin = day.tempMin || day.low || '--';
        const tempStr = `${tempMin}° ~ ${tempMax}°`;
        
        const windDir = day.windDirDay || day.windDir || '--';
        const windScale = day.windScaleDay || day.windScale || '--';
        
        const aqiInfo = getAqiLevel(day.aqi);
        const aqiDisplay = day.aqi ? `${day.aqi} ${aqiInfo.text}` : '--';
        
        const notice = day.notice || '';
        
        return `
            <div class="weather-forecast-item">
                <div>
                    <div class="weather-forecast-date">${dateLabel}</div>
                    <div class="weather-forecast-week">${day.week || ''}</div>
                </div>
                <div>
                    <div class="weather-forecast-info">
                        <span class="weather-forecast-icon">${getWeatherIcon(dayWeather)}</span>
                        <span class="weather-forecast-text">${weatherText}</span>
                    </div>
                    <div class="weather-forecast-notice" title="${notice}">💡 ${notice}</div>
                </div>
                <div class="weather-forecast-temp">${tempStr}</div>
                <div class="weather-forecast-wind">${windDir} ${windScale}级</div>
                <div class="weather-forecast-aqi ${aqiInfo.class}">${aqiDisplay}</div>
            </div>
        `;
    }).join('');
}

// ========== 电力作业气象风险评估 ==========

function calculateRiskLevel(data) {
    const current = data.current || {};
    const weatherText = (current.weatherText || '').toLowerCase();
    const temp = parseFloat(current.temp) || 0;
    const windScale = parseInt(current.windScale) || 0;
    
    // 高风险条件：暴雨/大风/雷电
    const isStorm = weatherText.includes('暴雨') || weatherText.includes('大暴雨') || weatherText.includes('特大暴雨');
    const isThunder = weatherText.includes('雷') || weatherText.includes('雷暴') || weatherText.includes('雷阵雨');
    const isStrongWind = windScale >= 6;
    
    if (isStorm || isThunder || isStrongWind) {
        return 'high';
    }
    
    // 中风险条件：温度>35℃ 或 <5℃，或中雨以上
    const isHighTemp = temp > 35;
    const isLowTemp = temp < 5;
    const isModerateRain = weatherText.includes('中雨') || weatherText.includes('大雨') || weatherText.includes('阵雨');
    const isHeavyWind = windScale >= 5;
    const isSnow = weatherText.includes('雪') && !weatherText.includes('小');
    const isFogHeavy = weatherText.includes('大雾') || weatherText.includes('霾');
    
    if (isHighTemp || isLowTemp || isModerateRain || isHeavyWind || isSnow || isFogHeavy) {
        return 'medium';
    }
    
    return 'low';
}

function analyzeRiskFactors(data) {
    const current = data.current || {};
    const weatherText = current.weatherText || '';
    const temp = parseFloat(current.temp) || 0;
    const windScale = parseInt(current.windScale) || 0;
    const humidity = parseInt(current.shidu) || 0;
    const aqi = parseInt(current.aqi) || 0;
    
    const factors = [];
    
    // 高温风险
    if (temp > 35) {
        factors.push({
            type: 'high',
            icon: '🌡️',
            name: '高温风险',
            desc: `当前${temp}°C，高温作业风险`
        });
    } else if (temp > 30) {
        factors.push({
            type: 'mild',
            icon: '🌡️',
            name: '温度偏高',
            desc: `当前${temp}°C，注意防暑`
        });
    }
    
    // 低温风险
    if (temp < 5) {
        factors.push({
            type: 'high',
            icon: '❄️',
            name: '低温风险',
            desc: `当前${temp}°C，低温作业风险`
        });
    } else if (temp < 10) {
        factors.push({
            type: 'medium',
            icon: '❄️',
            name: '低温注意',
            desc: `当前${temp}°C，注意防寒保暖`
        });
    }
    
    // 降雨风险
    if (weatherText.includes('暴雨') || weatherText.includes('大暴雨')) {
        factors.push({
            type: 'high',
            icon: '🌧️',
            name: '暴雨风险',
            desc: '暴雨天气，防滑防触电'
        });
    } else if (weatherText.includes('大雨') || weatherText.includes('中雨')) {
        factors.push({
            type: 'medium',
            icon: '🌧️',
            name: '降雨风险',
            desc: '雨天作业，注意防滑防触电'
        });
    } else if (weatherText.includes('小雨') || weatherText.includes('阵雨')) {
        factors.push({
            type: 'mild',
            icon: '🌧️',
            name: '小雨注意',
            desc: '小雨天气，注意地滑'
        });
    }
    
    // 大风风险
    if (windScale >= 6) {
        factors.push({
            type: 'high',
            icon: '💨',
            name: '大风风险',
            desc: `${windScale}级大风，高空作业危险`
        });
    } else if (windScale >= 5) {
        factors.push({
            type: 'medium',
            icon: '💨',
            name: '风力偏大',
            desc: `${windScale}级风，注意高空作业安全`
        });
    }
    
    // 雷电风险
    if (weatherText.includes('雷') || weatherText.includes('雷暴') || weatherText.includes('雷阵雨')) {
        factors.push({
            type: 'high',
            icon: '⚡',
            name: '雷电风险',
            desc: '雷暴天气，禁止户外带电作业'
        });
    }
    
    // 能见度风险
    if (weatherText.includes('大雾') || weatherText.includes('霾') || weatherText.includes('沙尘')) {
        factors.push({
            type: 'medium',
            icon: '🌫️',
            name: '能见度风险',
            desc: '能见度低，注意作业安全'
        });
    } else if (weatherText.includes('雾') || weatherText.includes('轻度霾')) {
        factors.push({
            type: 'mild',
            icon: '🌫️',
            name: '轻度能见度影响',
            desc: '轻雾天气，保持警惕'
        });
    }
    
    // 降雪风险
    if (weatherText.includes('暴雪') || weatherText.includes('大雪')) {
        factors.push({
            type: 'high',
            icon: '❄️',
            name: '暴雪风险',
            desc: '强降雪，禁止高空作业'
        });
    } else if (weatherText.includes('中雪')) {
        factors.push({
            type: 'medium',
            icon: '❄️',
            name: '降雪风险',
            desc: '中雪天气，注意防滑防冻'
        });
    }
    
    // 空气质量
    if (aqi > 200) {
        factors.push({
            type: 'medium',
            icon: '😷',
            name: '空气质量差',
            desc: `AQI ${aqi}，重度污染，减少户外作业`
        });
    } else if (aqi > 100) {
        factors.push({
            type: 'mild',
            icon: '😷',
            name: '空气质量一般',
            desc: `AQI ${aqi}，轻度污染，敏感人群注意`
        });
    }
    
    // 如果没有任何风险因素，添加"天气良好"
    if (factors.length === 0) {
        factors.push({
            type: 'mild',
            icon: '✅',
            name: '天气良好',
            desc: '气象条件适宜作业'
        });
    }
    
    // 最多显示6个因素
    return factors.slice(0, 6);
}

function getWorkSuggestions(riskLevel, factors, data) {
    const current = data.current || {};
    const weatherText = current.weatherText || '';
    
    const suggestions = {
        allowed: [],
        caution: [],
        forbidden: []
    };
    
    if (riskLevel === 'low') {
        suggestions.allowed = [
            '各类户外施工作业',
            '高空作业、杆塔作业',
            '带电作业、设备检修',
            '设备运输、吊装作业'
        ];
        suggestions.caution = [
            '常规安全防护措施',
            '注意劳逸结合'
        ];
        suggestions.forbidden = [];
    } else if (riskLevel === 'medium') {
        suggestions.allowed = [
            '室内作业、控制室值班',
            '地面低风险作业',
            '设备巡检（非高空）'
        ];
        suggestions.caution = [
            '高空作业需加强防护措施',
            '配备防暑/防寒用品',
            '增加休息频次，避免疲劳作业',
            '安排专人监护高风险作业'
        ];
        suggestions.forbidden = [];
        
        // 根据具体风险因素调整
        if (weatherText.includes('雨')) {
            suggestions.forbidden.push('户外带电作业');
            suggestions.caution.push('雨天作业做好防滑、防触电措施');
        }
        if (parseInt(current.windScale) >= 5) {
            suggestions.forbidden.push('大型吊装作业');
            suggestions.caution.push('高空作业需采取防风措施');
        }
    } else {
        // high risk
        suggestions.allowed = [
            '室内设备检修维护',
            '应急值班值守',
            '安全培训学习'
        ];
        suggestions.caution = [
            '做好应急抢险准备',
            '密切关注天气变化',
            '保持通讯畅通'
        ];
        suggestions.forbidden = [
            '所有高空作业',
            '户外带电作业',
            '大型吊装作业',
            '杆塔登杆作业'
        ];
        
        if (weatherText.includes('雷')) {
            suggestions.forbidden.push('所有户外作业');
        }
    }
    
    return suggestions;
}

function renderRisks(data) {
    const container = document.getElementById('riskAssessmentContainer');
    const riskCountBadge = document.getElementById('riskCountBadge');
    
    const riskLevel = calculateRiskLevel(data);
    const factors = analyzeRiskFactors(data);
    const suggestions = getWorkSuggestions(riskLevel, factors, data);
    
    const levelConfig = {
        low: {
            text: '低风险',
            desc: '气象条件良好，适合作业',
            icon: '✅',
            score: '优'
        },
        medium: {
            text: '中风险',
            desc: '存在气象风险，需注意防范',
            icon: '⚠️',
            score: '中'
        },
        high: {
            text: '高风险',
            desc: '恶劣天气，禁止高危作业',
            icon: '🚫',
            score: '差'
        }
    };
    
    const config = levelConfig[riskLevel];
    const highFactorCount = factors.filter(f => f.type === 'high').length;
    
    // 更新徽章
    if (riskLevel === 'low') {
        riskCountBadge.textContent = '安全作业';
        riskCountBadge.className = 'pc-badge pc-badge-success';
    } else if (riskLevel === 'medium') {
        riskCountBadge.textContent = `${highFactorCount || factors.length}项注意`;
        riskCountBadge.className = 'pc-badge pc-badge-warning';
    } else {
        riskCountBadge.textContent = `${highFactorCount}项高危`;
        riskCountBadge.className = 'pc-badge pc-badge-danger';
    }
    
    const factorsHtml = factors.map(f => `
        <div class="weather-risk-factor-item ${f.type === 'high' ? 'active' : (f.type === 'medium' ? 'medium' : 'mild')}">
            <div class="weather-risk-factor-icon">${f.icon}</div>
            <div class="weather-risk-factor-info">
                <div class="weather-risk-factor-name">${f.name}</div>
                <div class="weather-risk-factor-desc">${f.desc}</div>
            </div>
        </div>
    `).join('');
    
    const allowedHtml = suggestions.allowed.length > 0 
        ? `<li>${suggestions.allowed.join('</li><li>')}</li>` : '';
    const cautionHtml = suggestions.caution.length > 0 
        ? `<li class="caution">${suggestions.caution.join('</li><li class="caution">')}</li>` : '';
    const forbiddenHtml = suggestions.forbidden.length > 0 
        ? `<li class="forbidden">${suggestions.forbidden.join('</li><li class="forbidden">')}</li>` : '';
    
    container.innerHTML = `
        <div class="weather-risk-assess-card">
            <div class="weather-risk-header ${riskLevel}">
                <div class="weather-risk-level-icon">${config.icon}</div>
                <div class="weather-risk-level-info">
                    <div class="weather-risk-level-label">电力作业气象风险等级</div>
                    <div class="weather-risk-level-text">${config.text}</div>
                    <div class="weather-risk-level-desc">${config.desc}</div>
                </div>
                <div class="weather-risk-score-badge">
                    <div class="weather-risk-score-value">${config.score}</div>
                    <div class="weather-risk-score-label">安全评级</div>
                </div>
            </div>
            <div class="weather-risk-body">
                <div class="weather-risk-section-title">风险因素分析</div>
                <div class="weather-risk-factors">
                    ${factorsHtml}
                </div>
                
                <div class="weather-risk-section-title">作业建议</div>
                <div class="weather-suggestion-box">
                    ${suggestions.allowed.length > 0 ? `
                    <div class="weather-suggestion-row">
                        <div class="weather-suggestion-label"><span class="icon">✅</span> 可进行的作业</div>
                        <div class="weather-suggestion-content">
                            <ul>${allowedHtml}</ul>
                        </div>
                    </div>
                    ` : ''}
                    ${suggestions.caution.length > 0 ? `
                    <div class="weather-suggestion-row">
                        <div class="weather-suggestion-label"><span class="icon">💡</span> 防护措施建议</div>
                        <div class="weather-suggestion-content">
                            <ul>${cautionHtml}</ul>
                        </div>
                    </div>
                    ` : ''}
                    ${suggestions.forbidden.length > 0 ? `
                    <div class="weather-suggestion-row">
                        <div class="weather-suggestion-label"><span class="icon">🚫</span> 禁止进行的作业</div>
                        <div class="weather-suggestion-content">
                            <ul>${forbiddenHtml}</ul>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="weather-risk-footer-actions">
                    <button class="weather-risk-action-btn secondary" onclick="viewRelatedAccidents('${riskLevel}')">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        查看相关事故案例
                    </button>
                </div>
            </div>
        </div>
    `;
}

function viewRelatedAccidents(riskLevel) {
    const typeMap = {
        'high': '高处坠落,触电,坍塌',
        'medium': '高处坠落,其他',
        'low': '其他'
    };
    const type = typeMap[riskLevel] || '其他';
    window.location.href = `accident-cases.html?type=${encodeURIComponent(type)}`;
}

function generateRiskDisclosure() {
    if (!currentWeatherData) {
        showToast('暂无天气数据');
        return;
    }
    
    const current = currentWeatherData.current || {};
    const cityInfo = currentWeatherData.cityInfo || {};
    const riskLevel = calculateRiskLevel(currentWeatherData);
    const factors = analyzeRiskFactors(currentWeatherData);
    const suggestions = getWorkSuggestions(riskLevel, factors, currentWeatherData);
    
    const levelText = { low: '低风险', medium: '中风险', high: '高风险' }[riskLevel];
    
    // 保存到localStorage供交底单页面使用
    const weatherDisclosure = {
        title: '气象条件安全交底单',
        city: cityInfo.cityName || '',
        date: new Date().toLocaleDateString(),
        weather: current.weatherText || '',
        temperature: current.temp + '°C',
        wind: current.windDir + ' ' + current.windScale + '级',
        humidity: current.shidu || '',
        riskLevel: levelText,
        factors: factors.map(f => f.name + '：' + f.desc),
        allowedWork: suggestions.allowed,
        cautionMeasures: suggestions.caution,
        forbiddenWork: suggestions.forbidden,
        source: 'weather'
    };
    
    localStorage.setItem('weatherDisclosure', JSON.stringify(weatherDisclosure));
    localStorage.setItem('activeDisclosureTab', 'weather');
    
    showToast('风险交底单已生成，正在跳转...');
    setTimeout(() => {
        window.location.href = 'disclosure-form.html?type=weather';
    }, 800);
}

function checkHighRiskAlert(data) {
    const alertBanner = document.getElementById('weatherAlertBanner');
    const alertTitle = document.getElementById('alertTitle');
    const alertDesc = document.getElementById('alertDesc');
    
    const riskLevel = calculateRiskLevel(data);
    const factors = analyzeRiskFactors(data);
    
    if (riskLevel === 'high') {
        const highFactors = factors.filter(f => f.type === 'high');
        const factorNames = highFactors.map(f => f.name).join('、');
        alertTitle.textContent = `恶劣天气预警: ${factorNames}`;
        alertDesc.textContent = `当前检测到${highFactors.length}项高危气象风险，请立即采取防护措施，暂停高危户外作业！`;
        alertBanner.classList.add('show');
    } else {
        alertBanner.classList.remove('show');
    }
}

function refreshWeather() {
    if (currentCityCode) {
        loadWeatherData(currentCityCode);
    } else {
        const defaultCity = '101010100';
        currentCityCode = defaultCity;
        document.getElementById('citySearchInput').value = '北京';
        loadWeatherData(defaultCity);
    }
}

function syncRiskToDisclosure(index) {
    if (!currentWeatherData || !currentWeatherData.risks) return;
    
    const risk = currentWeatherData.risks[index];
    if (!risk) return;

    let weatherRisks = JSON.parse(localStorage.getItem('weatherRisks') || '[]');
    
    const exists = weatherRisks.some(r => r.riskName === risk.riskName);
    if (exists) {
        showToast('该风险已同步到交底单');
        return;
    }

    weatherRisks.push({
        ...risk,
        syncTime: new Date().toISOString(),
        source: 'weather'
    });
    
    localStorage.setItem('weatherRisks', JSON.stringify(weatherRisks));
    showToast('已同步到交底单');
}

function syncAllRisks() {
    if (!currentWeatherData) {
        showToast('暂无天气数据可同步');
        return;
    }

    const factors = analyzeRiskFactors(currentWeatherData);
    const highMediumFactors = factors.filter(f => f.type === 'high' || f.type === 'medium');
    
    if (highMediumFactors.length === 0) {
        showToast('当前无显著风险需要同步');
        return;
    }
    
    let weatherRisks = JSON.parse(localStorage.getItem('weatherRisks') || '[]');
    
    let newCount = 0;
    highMediumFactors.forEach(factor => {
        const exists = weatherRisks.some(r => r.riskName === factor.name);
        if (!exists) {
            weatherRisks.push({
                riskName: factor.name,
                description: factor.desc,
                riskLevel: factor.type === 'high' ? '高' : '中',
                measures: [factor.desc],
                syncTime: new Date().toISOString(),
                source: 'weather'
            });
            newCount++;
        }
    });
    
    localStorage.setItem('weatherRisks', JSON.stringify(weatherRisks));
    showToast(`已同步 ${newCount} 项风险到交底单`);
}

function exportReport() {
    if (!currentWeatherData) {
        showToast('暂无数据可导出');
        return;
    }

    const cityInfo = currentWeatherData.cityInfo || {};
    const current = currentWeatherData.current || {};
    const forecast = currentWeatherData.forecast || [];
    const risks = currentWeatherData.risks || [];
    const riskLevel = calculateRiskLevel(currentWeatherData);
    const factors = analyzeRiskFactors(currentWeatherData);
    const suggestions = getWorkSuggestions(riskLevel, factors, currentWeatherData);
    const levelText = { low: '低风险', medium: '中风险', high: '高风险' }[riskLevel];

    let reportContent = '';
    reportContent += '========================================\n';
    reportContent += '      天气动态风险预警报告\n';
    reportContent += '========================================\n\n';
    
    reportContent += `城市: ${cityInfo.cityName || '--'}\n`;
    reportContent += `省份: ${cityInfo.province || '--'}\n`;
    reportContent += `更新时间: ${current.updateTime || new Date().toLocaleString()}\n\n`;
    
    reportContent += '----------------------------------------\n';
    reportContent += '当前天气\n';
    reportContent += '----------------------------------------\n';
    reportContent += `天气: ${current.weatherText || '--'}\n`;
    reportContent += `温度: ${current.temp || '--'}°C\n`;
    reportContent += `湿度: ${current.shidu || '--'}\n`;
    reportContent += `风向: ${current.windDir || '--'}\n`;
    reportContent += `风力: ${current.windScale || '--'}级\n`;
    reportContent += `空气质量: ${current.quality || '--'}\n\n`;
    
    reportContent += '----------------------------------------\n';
    reportContent += '未来3天预报\n';
    reportContent += '----------------------------------------\n';
    forecast.forEach((day, i) => {
        const dayLabel = i === 0 ? '今天' : (i === 1 ? '明天' : '后天');
        const dayWeather = day.dayWeather || day.weather || '--';
        const nightWeather = day.nightWeather || '';
        const weatherText = nightWeather ? `${dayWeather}转${nightWeather}` : dayWeather;
        const tempMax = day.tempMax || day.high || '--';
        const tempMin = day.tempMin || day.low || '--';
        reportContent += `${dayLabel}: ${weatherText} ${tempMin}°C ~ ${tempMax}°C\n`;
    });
    reportContent += '\n';
    
    reportContent += '----------------------------------------\n';
    reportContent += '气象风险评估\n';
    reportContent += '----------------------------------------\n';
    reportContent += `风险等级: ${levelText}\n\n`;
    
    reportContent += '风险因素:\n';
    factors.forEach((f, i) => {
        const typeText = { high: '高危', medium: '中等', mild: '轻度' }[f.type] || '一般';
        reportContent += `  ${i + 1}. [${typeText}] ${f.name} - ${f.desc}\n`;
    });
    
    reportContent += '\n作业建议:\n';
    if (suggestions.allowed.length > 0) {
        reportContent += '  可进行的作业:\n';
        suggestions.allowed.forEach(item => {
            reportContent += `    ✓ ${item}\n`;
        });
    }
    if (suggestions.caution.length > 0) {
        reportContent += '  防护措施建议:\n';
        suggestions.caution.forEach(item => {
            reportContent += `    ! ${item}\n`;
        });
    }
    if (suggestions.forbidden.length > 0) {
        reportContent += '  禁止进行的作业:\n';
        suggestions.forbidden.forEach(item => {
            reportContent += `    ✗ ${item}\n`;
        });
    }
    
    reportContent += '\n========================================\n';
    reportContent += `报告生成时间: ${new Date().toLocaleString()}\n`;
    reportContent += '========================================\n';

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `天气风险预警报告_${cityInfo.cityName || 'unknown'}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('报告导出成功');
}

function showToast(message) {
    let toast = document.getElementById('toastMessage');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastMessage';
        toast.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            background: var(--pc-primary, #0052CC);
            color: #fff;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            opacity: 0;
            transition: all 0.3s ease;
            font-size: 14px;
            font-family: "Microsoft YaHei", sans-serif;
        `;
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2000);
}

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    
    initCitySearch();
    
    const defaultCity = '101010100';
    currentCityCode = defaultCity;
    document.getElementById('citySearchInput').value = '北京';
    loadWeatherData(defaultCity);
});
