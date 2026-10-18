const API_BASE_URL = '/api';
let disclosureAbortController = null;
let taskAbortController = null;
let caseAbortController = null;
let dictAbortController = null;

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

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initNav();
    initUserDropdown();
    loadDashboardData();
    initTabs();
    initActionButtons();
    
    const urlParams = new URLSearchParams(window.location.search);
    const module = urlParams.get('module');
    if (module) {
        showModule(module);
        const navItem = document.querySelector(`.pc-sidebar-item[data-module="${module}"]`);
        if (navItem) {
            document.querySelectorAll('.pc-sidebar-item[data-module]').forEach(i => i.classList.remove('active'));
            navItem.classList.add('active');
        }
    }
});

function initActionButtons() {
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.action-btn');
        if (btn) {
            const action = btn.getAttribute('data-action');
            const tableId = btn.getAttribute('data-table');
            const id = parseInt(btn.getAttribute('data-id'));
            
            if (action === 'edit') {
                editItem(tableId, id);
            } else if (action === 'delete') {
                deleteItem(tableId, id);
            } else if (action === 'editDict') {
                editDictItem(tableId, id);
            } else if (action === 'deleteDict') {
                deleteDictItem(tableId, id);
            }
        }
    });
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    
    if (username) {
        document.getElementById('usernameDisplay').textContent = username;
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.textContent = username.charAt(0).toUpperCase();
        }
        const dropdownUsername = document.getElementById('dropdownUsername');
        if (dropdownUsername) {
            dropdownUsername.textContent = username;
        }
    }
}

function initNav() {
    const navItems = document.querySelectorAll('.pc-sidebar-item[data-module]');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            const module = this.dataset.module;
            
            if (!module) return;
            
            e.preventDefault();
            
            navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            showModule(module);
        });
    });
}

function initUserDropdown() {
    const userDropdown = document.querySelector('.pc-sidebar-user');
    if (!userDropdown) return;
    
    userDropdown.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('open');
    });
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.pc-sidebar-user')) {
            userDropdown.classList.remove('open');
        }
    });
}

function showModule(module) {
    const modules = ['home', 'tasks', 'hazards', 'disclosures', 'cases', 'dict'];
    
    modules.forEach(m => {
        const el = document.getElementById(m + 'Module');
        if (el) {
            if (m === module) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    });
    
    if (module === 'tasks') loadTasks();
    if (module === 'hazards') loadHazards();
    if (module === 'disclosures') loadDisclosures();
    if (module === 'cases') loadCases();
    if (module === 'dict') {
        loadHazardDict();
        loadMeasureDict();
    }
}

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const tab = this.dataset.tab;
            document.getElementById('hazardDictSection').style.display = tab === 'hazard' ? 'block' : 'none';
            document.getElementById('measureDictSection').style.display = tab === 'measure' ? 'block' : 'none';
        });
    });
}

async function loadDashboardData() {
    try {
        const [tasksRes, hazardsRes, disclosuresRes, casesRes] = await Promise.all([
            apiFetch(`${API_BASE_URL}/tasks`),
            apiFetch(`${API_BASE_URL}/hazards`),
            apiFetch(`${API_BASE_URL}/disclosures`),
            apiFetch(`${API_BASE_URL}/accident-cases`)
        ]);
        
        const tasks = await tasksRes.json();
        const hazards = await hazardsRes.json();
        const disclosures = await disclosuresRes.json();
        const cases = await casesRes.json();
        
        document.getElementById('taskCount').textContent = tasks.length || 0;
        document.getElementById('hazardCount').textContent = hazards.length || 0;
        document.getElementById('disclosureCount').textContent = disclosures.length || 0;
        document.getElementById('caseCount').textContent = cases.length || 0;
        
        renderRecentTasks(tasks.slice(0, 5));
        renderHazardDistribution(hazards);
        
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

function renderRecentTasks(tasks) {
    const container = document.getElementById('recentTasks');
    container.innerHTML = '';
    
    if (tasks.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.4); text-align: center; padding: 20px;">暂无任务</p>';
        return;
    }
    
    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <span class="task-name">${task.taskName || '未命名任务'}</span>
            <span class="task-status ${task.status || 'pending'}">${getStatusText(task.status)}</span>
        `;
        container.appendChild(div);
    });
}

function renderHazardDistribution(hazards) {
    const container = document.getElementById('hazardDistribution');
    container.innerHTML = '';
    
    if (hazards.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.4); text-align: center; padding: 20px;">暂无危险源数据</p>';
        return;
    }
    
    const categories = {};
    hazards.forEach(h => {
        const cat = h.category || '未分类';
        categories[cat] = (categories[cat] || 0) + 1;
    });
    
    Object.keys(categories).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'hazard-item';
        div.innerHTML = `
            <div class="hazard-count">${categories[cat]}</div>
            <div class="hazard-name">${cat}</div>
        `;
        container.appendChild(div);
    });
}

async function loadTasks() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/tasks`);
        const tasks = await response.json();
        renderTable('tasksTable', tasks, ['id', 'taskName', 'taskType', 'status', 'createTime'], ['ID', '任务名称', '任务类型', '状态', '创建时间']);
    } catch (error) {
        console.error('加载任务失败:', error);
    }
}

async function loadHazards() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/hazards`);
        const hazards = await response.json();
        renderTable('hazardsTable', hazards, ['id', 'hazardName', 'category', 'hazardLevel', 'location'], ['ID', '危险源名称', '类别', '风险等级', '位置']);
    } catch (error) {
        console.error('加载危险源失败:', error);
    }
}

async function loadDisclosures() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/disclosures`);
        const disclosures = await response.json();
        renderTable('disclosuresTable', disclosures, ['id', 'title', 'disclosureType', 'disclosureStatus', 'createTime'], ['ID', '标题', '交底类型', '状态', '创建时间']);
    } catch (error) {
        console.error('加载交底失败:', error);
        showEmptyState('disclosuresTable', '加载失败，请刷新重试');
    }
}

async function loadCases() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/accident-cases`);
        const cases = await response.json();
        renderTable('casesTable', cases, ['id', 'caseName', 'accidentType', 'severity', 'occurTime'], ['ID', '案例名称', '事故类型', '严重程度', '发生时间']);
    } catch (error) {
        console.error('加载案例失败:', error);
    }
}

async function loadHazardDict() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/dict/hazard`);
        const items = await response.json();
        renderDictTable('hazardDictTable', items);
    } catch (error) {
        console.error('加载危险源字典失败:', error);
    }
}

async function loadMeasureDict() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/dict/measure`);
        const items = await response.json();
        renderDictTable('measureDictTable', items);
    } catch (error) {
        console.error('加载措施字典失败:', error);
    }
}

function renderTable(tableId, data, fields, headers) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align: center; color: rgba(255,255,255,0.4); padding: 30px;">暂无数据</td></tr>`;
        return;
    }
    
    data.forEach(item => {
        const row = document.createElement('tr');
        let html = '';
        
        fields.forEach(field => {
            let value = item[field];
            if (field === 'status' || field === 'disclosureStatus') {
                const statusValue = item[field] || item['status'];
                value = `<span class="task-status ${statusValue}">${getStatusText(statusValue)}</span>`;
            } else if (field === 'createTime' || field === 'occurTime') {
                value = formatDate(value);
            } else if (field === 'hazardLevel') {
                value = getRiskLevelText(value);
            } else if (field === 'severity') {
                value = getSeverityText(value);
            }
            html += `<td>${value}</td>`;
        });
        
        let detailBtn = '';
        if (tableId === 'disclosuresTable') {
            detailBtn = `<button class="action-btn detail" onclick="viewDisclosure(${item.id})">详情</button>`;
        }
        
        html += `
            <td>
                <div class="action-buttons">
                    ${detailBtn}
                    <button class="action-btn edit" data-action="edit" data-table="${tableId}" data-id="${item.id}">编辑</button>
                    <button class="action-btn delete" data-action="delete" data-table="${tableId}" data-id="${item.id}">删除</button>
                </div>
            </td>
        `;
        
        row.innerHTML = html;
        tbody.appendChild(row);
    });
}

function renderDictTable(tableId, data) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: rgba(255,255,255,0.4); padding: 30px;">暂无数据</td></tr>';
        return;
    }
    
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.id}</td>
            <td>${item.dictCode || '-'}</td>
            <td>${item.dictName || '-'}</td>
            <td>${item.dictDesc || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" data-action="editDict" data-table="${tableId}" data-id="${item.id}">编辑</button>
                    <button class="action-btn delete" data-action="deleteDict" data-table="${tableId}" data-id="${item.id}">删除</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function getStatusText(status) {
    const map = {
        'pending': '待处理',
        'processing': '处理中',
        'completed': '已完成',
        'draft': '草稿',
        'published': '已发布'
    };
    return map[status] || status || '未知';
}

function getRiskLevelText(level) {
    const map = {
        'high': '高风险',
        'medium': '中风险',
        'low': '低风险'
    };
    return map[level] || level || '未知';
}

function getSeverityText(severity) {
    const map = {
        'major': '重大',
        'serious': '严重',
        'general': '一般'
    };
    return map[severity] || severity || '未知';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN');
    } catch {
        return dateStr;
    }
}

function openTaskModal() {
    document.getElementById('modalTitle').textContent = '新建任务';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>任务名称</label>
            <input type="text" id="taskName" placeholder="请输入任务名称">
        </div>
        <div class="form-group">
            <label>任务类型</label>
            <input type="text" id="taskType" placeholder="请输入任务类型">
        </div>
        <div class="form-group">
            <label>任务描述</label>
            <textarea id="taskDesc" placeholder="请输入任务描述"></textarea>
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="taskStatus">
                <option value="pending">待处理</option>
                <option value="processing">处理中</option>
                <option value="completed">已完成</option>
            </select>
        </div>
    `;
    document.getElementById('modalSubmit').onclick = submitTask;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function submitTask() {
    const data = {
        taskName: document.getElementById('taskName').value,
        taskType: document.getElementById('taskType').value,
        taskDesc: document.getElementById('taskDesc').value,
        status: document.getElementById('taskStatus').value
    };
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadTasks();
            loadDashboardData();
        }
    } catch (error) {
        console.error('提交失败:', error);
    }
}

function openHazardModal() {
    document.getElementById('modalTitle').textContent = '新增危险源';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>危险源名称</label>
            <input type="text" id="hazardName" placeholder="请输入危险源名称">
        </div>
        <div class="form-group">
            <label>类别</label>
            <input type="text" id="hazardCategory" placeholder="请输入类别">
        </div>
        <div class="form-group">
            <label>风险等级</label>
            <select id="hazardLevel">
                <option value="high">高风险</option>
                <option value="medium">中风险</option>
                <option value="low">低风险</option>
            </select>
        </div>
        <div class="form-group">
            <label>位置</label>
            <input type="text" id="hazardLocation" placeholder="请输入位置">
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="hazardDesc" placeholder="请输入描述"></textarea>
        </div>
    `;
    document.getElementById('modalSubmit').onclick = submitHazard;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function submitHazard() {
    const data = {
        hazardName: document.getElementById('hazardName').value,
        category: document.getElementById('hazardCategory').value,
        hazardLevel: document.getElementById('hazardLevel').value,
        location: document.getElementById('hazardLocation').value,
        description: document.getElementById('hazardDesc').value
    };
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/hazards`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadHazards();
            loadDashboardData();
        }
    } catch (error) {
        console.error('提交失败:', error);
    }
}

// ========== AI生成交底卡 ==========
function openAiGenerateDisclosureModal() {
    document.getElementById('modalTitle').textContent = 'AI生成安全交底卡';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>作业任务名称 <span style="color: var(--pc-danger);">*</span></label>
            <input type="text" id="aiTaskName" placeholder="例如：10kV某线路1#杆更换绝缘子作业">
        </div>
        <div class="form-group">
            <label>电压等级</label>
            <select id="aiVoltageLevel">
                <option value="10kV">10kV</option>
                <option value="35kV">35kV</option>
                <option value="110kV">110kV</option>
                <option value="220kV">220kV</option>
                <option value="低压">低压</option>
            </select>
        </div>
        <div class="form-group">
            <label>作业类型</label>
            <select id="aiWorkType">
                <option value="检修">检修作业</option>
                <option value="施工">施工作业</option>
                <option value="运维">运维作业</option>
                <option value="试验">试验作业</option>
                <option value="安装">安装作业</option>
            </select>
        </div>
        <div class="form-group">
            <label>任务描述</label>
            <textarea id="aiTaskDesc" placeholder="请简要描述作业内容和环境条件..." rows="3"></textarea>
        </div>
        <div class="ai-generate-tip" style="background: var(--pc-primary-pale); padding: 12px; border-radius: 8px; font-size: 13px; color: var(--pc-text-secondary);">
            💡 AI将基于电力安全知识库，自动生成包含危险点辨识、安全控制措施、参考案例等内容的完整交底卡。
        </div>
    `;
    document.getElementById('modalSubmit').textContent = '开始生成';
    document.getElementById('modalSubmit').onclick = generateDisclosureByAi;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function generateDisclosureByAi() {
    const taskName = document.getElementById('aiTaskName').value.trim();
    if (!taskName) {
        alert('请输入作业任务名称');
        return;
    }

    const submitBtn = document.getElementById('modalSubmit');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '生成中...';

    try {
        // 调用一键完成流程（任务解析 → 危险点识别 → 措施生成 → 交底卡生成）
        const flowData = {
            taskName: taskName,
            taskDesc: document.getElementById('aiTaskDesc').value,
            taskText: document.getElementById('aiTaskDesc').value || taskName,
            voltageLevel: document.getElementById('aiVoltageLevel').value,
            workType: document.getElementById('aiWorkType').value
        };

        const flowRes = await apiFetch(`${API_BASE_URL}/agent/complete-flow`, {
            method: 'POST',
            body: JSON.stringify(flowData)
        });

        if (!flowRes.ok) {
            throw new Error('生成交底卡失败');
        }

        const result = await flowRes.json();
        const disclosure = result.disclosure;

        if (!disclosure || !disclosure.id) {
            throw new Error('交底卡生成失败');
        }

        closeModal();
        loadDisclosures();
        loadDashboardData();

        // 跳转到交底卡详情页
        if (confirm('交底卡生成成功！是否查看详情？')) {
            window.location.href = `disclosure-detail.html?id=${disclosure.id}`;
        }

    } catch (error) {
        console.error('AI生成交底卡失败:', error);
        alert('生成失败：' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function openDisclosureModal() {
    document.getElementById('modalTitle').textContent = '新建交底';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="disclosureTitle" placeholder="请输入标题">
        </div>
        <div class="form-group">
            <label>交底类型</label>
            <input type="text" id="disclosureType" placeholder="请输入交底类型">
        </div>
        <div class="form-group">
            <label>内容</label>
            <textarea id="disclosureContent" placeholder="请输入交底内容"></textarea>
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="disclosureStatus">
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
            </select>
        </div>
    `;
    document.getElementById('modalSubmit').onclick = submitDisclosure;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function submitDisclosure() {
    const data = {
        title: document.getElementById('disclosureTitle').value,
        disclosureType: document.getElementById('disclosureType').value,
        content: document.getElementById('disclosureContent').value,
        disclosureStatus: document.getElementById('disclosureStatus').value
    };
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/disclosures`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadDisclosures();
            loadDashboardData();
        } else {
            const errorData = await response.json();
            alert('提交失败: ' + (errorData.message || '未知错误'));
        }
    } catch (error) {
        console.error('提交失败:', error);
        alert('提交失败，请重试');
    }
}

function openCaseModal() {
    document.getElementById('modalTitle').textContent = '添加案例';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>案例名称</label>
            <input type="text" id="caseName" placeholder="请输入案例名称">
        </div>
        <div class="form-group">
            <label>事故类型</label>
            <input type="text" id="accidentType" placeholder="请输入事故类型">
        </div>
        <div class="form-group">
            <label>严重程度</label>
            <select id="caseSeverity">
                <option value="major">重大</option>
                <option value="serious">严重</option>
                <option value="general">一般</option>
            </select>
        </div>
        <div class="form-group">
            <label>案例描述</label>
            <textarea id="caseDesc" placeholder="请输入案例描述"></textarea>
        </div>
    `;
    document.getElementById('modalSubmit').onclick = submitCase;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function submitCase() {
    const data = {
        caseName: document.getElementById('caseName').value,
        accidentType: document.getElementById('accidentType').value,
        severity: document.getElementById('caseSeverity').value,
        caseDesc: document.getElementById('caseDesc').value
    };
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/accident-cases`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadCases();
            loadDashboardData();
        }
    } catch (error) {
        console.error('提交失败:', error);
    }
}

function openHazardDictModal() {
    document.getElementById('modalTitle').textContent = '新增危险源类型';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>编码</label>
            <input type="text" id="dictCode" placeholder="请输入编码">
        </div>
        <div class="form-group">
            <label>名称</label>
            <input type="text" id="dictName" placeholder="请输入名称">
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="dictDesc" placeholder="请输入描述"></textarea>
        </div>
    `;
    document.getElementById('modalSubmit').onclick = submitHazardDict;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function submitHazardDict() {
    const data = {
        dictCode: document.getElementById('dictCode').value,
        dictName: document.getElementById('dictName').value,
        dictDesc: document.getElementById('dictDesc').value
    };
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/dict/hazard`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadHazardDict();
        }
    } catch (error) {
        console.error('提交失败:', error);
    }
}

function openMeasureDictModal() {
    document.getElementById('modalTitle').textContent = '新增措施类型';
    document.getElementById('modalBody').innerHTML = `
        <div class="form-group">
            <label>编码</label>
            <input type="text" id="measureCode" placeholder="请输入编码">
        </div>
        <div class="form-group">
            <label>名称</label>
            <input type="text" id="measureName" placeholder="请输入名称">
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="measureDesc" placeholder="请输入描述"></textarea>
        </div>
    `;
    document.getElementById('modalSubmit').onclick = submitMeasureDict;
    document.getElementById('modalOverlay').style.display = 'flex';
}

async function submitMeasureDict() {
    const data = {
        dictCode: document.getElementById('measureCode').value,
        dictName: document.getElementById('measureName').value,
        dictDesc: document.getElementById('measureDesc').value
    };
    
    try {
        const response = await apiFetch(`${API_BASE_URL}/dict/measure`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadMeasureDict();
        }
    } catch (error) {
        console.error('提交失败:', error);
    }
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
}

async function editItem(tableId, id) {
    const modalSubmit = document.getElementById('modalSubmit');
    
    if (tableId === 'disclosuresTable') {
        try {
            modalSubmit.innerHTML = '<span class="loading">加载中...</span>';
            modalSubmit.disabled = true;
            
            const response = await apiFetch(`${API_BASE_URL}/disclosures/${id}`);
            if (!response.ok) throw new Error('获取数据失败');
            
            const disclosure = await response.json();
            
            document.getElementById('modalTitle').textContent = '编辑安全交底卡';
            document.getElementById('modalBody').innerHTML = `
                <input type="hidden" id="editDisclosureId" value="${disclosure.id}">
                <div class="form-group">
                    <label>编号</label>
                    <input type="text" id="editDisclosureNo" value="${disclosure.disclosureNo || ''}" placeholder="请输入编号">
                </div>
                <div class="form-group">
                    <label>标题</label>
                    <input type="text" id="editDisclosureTitle" value="${disclosure.title || ''}" placeholder="请输入标题">
                </div>
                <div class="form-group">
                    <label>交底类型</label>
                    <input type="text" id="editDisclosureType" value="${disclosure.disclosureType || ''}" placeholder="请输入交底类型">
                </div>
                <div class="form-group">
                    <label>内容</label>
                    <textarea id="editDisclosureContent" placeholder="请输入交底内容" style="min-height: 120px;">${disclosure.content || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>应急联系人</label>
                    <input type="text" id="editEmergencyContact" value="${disclosure.emergencyContact || ''}" placeholder="请输入应急联系人">
                </div>
                <div class="form-group">
                    <label>应急路线</label>
                    <input type="text" id="editEmergencyRoute" value="${disclosure.emergencyRoute || ''}" placeholder="请输入应急路线">
                </div>
                <div class="form-group">
                    <label>状态</label>
                    <select id="editDisclosureStatus">
                        <option value="draft" ${disclosure.disclosureStatus === 'draft' ? 'selected' : ''}>草稿</option>
                        <option value="published" ${disclosure.disclosureStatus === 'published' ? 'selected' : ''}>已发布</option>
                    </select>
                </div>
            `;
            
            document.getElementById('modalSubmit').onclick = submitEditDisclosure;
            document.getElementById('modalOverlay').style.display = 'flex';
            
        } catch (error) {
            console.error('加载编辑数据失败:', error);
            alert('加载数据失败，请重试');
        } finally {
            modalSubmit.innerHTML = '确认';
            modalSubmit.disabled = false;
        }
    } else if (tableId === 'tasksTable') {
        try {
            modalSubmit.innerHTML = '<span class="loading">加载中...</span>';
            modalSubmit.disabled = true;
            
            const response = await apiFetch(`${API_BASE_URL}/tasks/${id}`);
            if (!response.ok) throw new Error('获取数据失败');
            
            const task = await response.json();
            
            document.getElementById('modalTitle').textContent = '编辑任务';
            document.getElementById('modalBody').innerHTML = `
                <input type="hidden" id="editTaskId" value="${task.id}">
                <div class="form-group">
                    <label>任务名称</label>
                    <input type="text" id="editTaskName" value="${task.taskName || ''}" placeholder="请输入任务名称">
                </div>
                <div class="form-group">
                    <label>任务类型</label>
                    <input type="text" id="editTaskType" value="${task.taskType || ''}" placeholder="请输入任务类型">
                </div>
                <div class="form-group">
                    <label>任务描述</label>
                    <textarea id="editTaskDesc" placeholder="请输入任务描述">${task.taskDesc || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>电压等级</label>
                    <input type="text" id="editVoltageLevel" value="${task.voltageLevel || ''}" placeholder="请输入电压等级">
                </div>
                <div class="form-group">
                    <label>设备类型</label>
                    <input type="text" id="editEquipmentType" value="${task.equipmentType || ''}" placeholder="请输入设备类型">
                </div>
                <div class="form-group">
                    <label>作业类型</label>
                    <input type="text" id="editWorkType" value="${task.workType || ''}" placeholder="请输入作业类型">
                </div>
                <div class="form-group">
                    <label>状态</label>
                    <select id="editTaskStatus">
                        <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>待处理</option>
                        <option value="processing" ${task.status === 'processing' ? 'selected' : ''}>处理中</option>
                        <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>已完成</option>
                    </select>
                </div>
            `;
            
            document.getElementById('modalSubmit').onclick = submitEditTask;
            document.getElementById('modalOverlay').style.display = 'flex';
            
        } catch (error) {
            console.error('加载编辑数据失败:', error);
            alert('加载数据失败，请重试');
        } finally {
            modalSubmit.innerHTML = '确认';
            modalSubmit.disabled = false;
        }
    } else if (tableId === 'hazardsTable') {
        try {
            modalSubmit.innerHTML = '<span class="loading">加载中...</span>';
            modalSubmit.disabled = true;
            
            const response = await apiFetch(`${API_BASE_URL}/hazards/${id}`);
            if (!response.ok) throw new Error('获取数据失败');
            
            const hazard = await response.json();
            
            document.getElementById('modalTitle').textContent = '编辑危险源';
            document.getElementById('modalBody').innerHTML = `
                <input type="hidden" id="editHazardId" value="${hazard.id}">
                <div class="form-group">
                    <label>危险源名称</label>
                    <input type="text" id="editHazardName" value="${hazard.hazardName || ''}" placeholder="请输入危险源名称">
                </div>
                <div class="form-group">
                    <label>类别</label>
                    <input type="text" id="editHazardCategory" value="${hazard.category || ''}" placeholder="请输入类别">
                </div>
                <div class="form-group">
                    <label>风险等级</label>
                    <select id="editHazardLevel">
                        <option value="high" ${hazard.hazardLevel === 'high' ? 'selected' : ''}>高风险</option>
                        <option value="medium" ${hazard.hazardLevel === 'medium' ? 'selected' : ''}>中风险</option>
                        <option value="low" ${hazard.hazardLevel === 'low' ? 'selected' : ''}>低风险</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>位置</label>
                    <input type="text" id="editHazardLocation" value="${hazard.location || ''}" placeholder="请输入位置">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea id="editHazardDesc" placeholder="请输入描述">${hazard.description || ''}</textarea>
                </div>
            `;
            
            document.getElementById('modalSubmit').onclick = submitEditHazard;
            document.getElementById('modalOverlay').style.display = 'flex';
            
        } catch (error) {
            console.error('加载编辑数据失败:', error);
            alert('加载数据失败，请重试');
        } finally {
            modalSubmit.innerHTML = '确认';
            modalSubmit.disabled = false;
        }
    } else if (tableId === 'casesTable') {
        try {
            modalSubmit.innerHTML = '<span class="loading">加载中...</span>';
            modalSubmit.disabled = true;
            
            const response = await apiFetch(`${API_BASE_URL}/accident-cases/${id}`);
            if (!response.ok) throw new Error('获取数据失败');
            
            const caseData = await response.json();
            
            document.getElementById('modalTitle').textContent = '编辑事故案例';
            document.getElementById('modalBody').innerHTML = `
                <input type="hidden" id="editCaseId" value="${caseData.id}">
                <div class="form-group">
                    <label>案例名称</label>
                    <input type="text" id="editCaseName" value="${caseData.caseName || ''}" placeholder="请输入案例名称">
                </div>
                <div class="form-group">
                    <label>事故类型</label>
                    <input type="text" id="editAccidentType" value="${caseData.accidentType || ''}" placeholder="请输入事故类型">
                </div>
                <div class="form-group">
                    <label>严重程度</label>
                    <select id="editCaseSeverity">
                        <option value="major" ${caseData.severity === 'major' ? 'selected' : ''}>重大</option>
                        <option value="serious" ${caseData.severity === 'serious' ? 'selected' : ''}>严重</option>
                        <option value="general" ${caseData.severity === 'general' ? 'selected' : ''}>一般</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>案例描述</label>
                    <textarea id="editCaseDesc" placeholder="请输入案例描述">${caseData.caseDesc || ''}</textarea>
                </div>
            `;
            
            document.getElementById('modalSubmit').onclick = submitEditCase;
            document.getElementById('modalOverlay').style.display = 'flex';
            
        } catch (error) {
            console.error('加载编辑数据失败:', error);
            alert('加载数据失败，请重试');
        } finally {
            modalSubmit.innerHTML = '确认';
            modalSubmit.disabled = false;
        }
    } else {
        alert('该类型数据的编辑功能开发中');
    }
}

async function submitEditDisclosure() {
    const modalSubmit = document.getElementById('modalSubmit');
    try {
        if (disclosureAbortController) {
            disclosureAbortController.abort();
        }
        disclosureAbortController = new AbortController();
        
        modalSubmit.innerHTML = '<span class="loading">保存中...</span>';
        modalSubmit.disabled = true;
        
        const data = {
            id: parseInt(document.getElementById('editDisclosureId').value),
            disclosureNo: document.getElementById('editDisclosureNo').value,
            title: document.getElementById('editDisclosureTitle').value,
            disclosureType: document.getElementById('editDisclosureType').value,
            content: document.getElementById('editDisclosureContent').value,
            emergencyContact: document.getElementById('editEmergencyContact').value,
            emergencyRoute: document.getElementById('editEmergencyRoute').value,
            disclosureStatus: document.getElementById('editDisclosureStatus').value
        };
        
        const response = await apiFetch(`${API_BASE_URL}/disclosures/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            signal: disclosureAbortController.signal
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`保存失败: ${response.status} ${errorText}`);
        }
        
        closeModal();
        loadDisclosures();
        loadDashboardData();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('保存失败:', error);
            alert(`保存失败：${error.message}`);
        }
    } finally {
        modalSubmit.innerHTML = '确认';
        modalSubmit.disabled = false;
        disclosureAbortController = null;
    }
}

async function submitEditTask() {
    const modalSubmit = document.getElementById('modalSubmit');
    try {
        if (taskAbortController) {
            taskAbortController.abort();
        }
        taskAbortController = new AbortController();
        
        modalSubmit.innerHTML = '<span class="loading">保存中...</span>';
        modalSubmit.disabled = true;
        
        const data = {
            id: parseInt(document.getElementById('editTaskId').value),
            taskName: document.getElementById('editTaskName').value,
            taskType: document.getElementById('editTaskType').value,
            taskDesc: document.getElementById('editTaskDesc').value,
            voltageLevel: document.getElementById('editVoltageLevel').value,
            equipmentType: document.getElementById('editEquipmentType').value,
            workType: document.getElementById('editWorkType').value,
            status: document.getElementById('editTaskStatus').value
        };
        
        const response = await apiFetch(`${API_BASE_URL}/tasks/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            signal: taskAbortController.signal
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`保存失败: ${response.status} ${errorText}`);
        }
        
        closeModal();
        loadTasks();
        loadDashboardData();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('保存失败:', error);
            alert(`保存失败：${error.message}`);
        }
    } finally {
        modalSubmit.innerHTML = '确认';
        modalSubmit.disabled = false;
        taskAbortController = null;
    }
}

async function submitEditHazard() {
    const modalSubmit = document.getElementById('modalSubmit');
    try {
        if (dictAbortController) {
            dictAbortController.abort();
        }
        dictAbortController = new AbortController();
        
        modalSubmit.innerHTML = '<span class="loading">保存中...</span>';
        modalSubmit.disabled = true;
        
        const data = {
            id: parseInt(document.getElementById('editHazardId').value),
            hazardName: document.getElementById('editHazardName').value,
            category: document.getElementById('editHazardCategory').value,
            hazardLevel: document.getElementById('editHazardLevel').value,
            location: document.getElementById('editHazardLocation').value,
            description: document.getElementById('editHazardDesc').value
        };
        
        const response = await apiFetch(`${API_BASE_URL}/hazards/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            signal: dictAbortController.signal
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`保存失败: ${response.status} ${errorText}`);
        }
        
        closeModal();
        loadHazards();
        loadDashboardData();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('保存失败:', error);
            alert(`保存失败：${error.message}`);
        }
    } finally {
        modalSubmit.innerHTML = '确认';
        modalSubmit.disabled = false;
        dictAbortController = null;
    }
}

async function submitEditCase() {
    const modalSubmit = document.getElementById('modalSubmit');
    try {
        if (caseAbortController) {
            caseAbortController.abort();
        }
        caseAbortController = new AbortController();
        
        modalSubmit.innerHTML = '<span class="loading">保存中...</span>';
        modalSubmit.disabled = true;
        
        const data = {
            id: parseInt(document.getElementById('editCaseId').value),
            caseName: document.getElementById('editCaseName').value,
            accidentType: document.getElementById('editAccidentType').value,
            severity: document.getElementById('editCaseSeverity').value,
            caseDesc: document.getElementById('editCaseDesc').value
        };
        
        const response = await apiFetch(`${API_BASE_URL}/accident-cases/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            signal: caseAbortController.signal
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`保存失败: ${response.status} ${errorText}`);
        }
        
        closeModal();
        loadCases();
        loadDashboardData();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('保存失败:', error);
            alert(`保存失败：${error.message}`);
        }
    } finally {
        modalSubmit.innerHTML = '确认';
        modalSubmit.disabled = false;
        caseAbortController = null;
    }
}

async function editDictItem(tableId, id) {
    const isHazard = tableId === 'hazardDictTable';
    const url = isHazard ? `${API_BASE_URL}/dict/hazard/${id}` : `${API_BASE_URL}/dict/measure/${id}`;
    
    try {
        const response = await apiFetch(url);
        const item = await response.json();
        
        document.getElementById('modalTitle').textContent = isHazard ? '编辑危险源类型' : '编辑安全措施';
        document.getElementById('modalBody').innerHTML = `
            <input type="hidden" id="dictEditId" value="${item.id}">
            <input type="hidden" id="dictEditType" value="${isHazard ? 'hazard' : 'measure'}">
            <div class="form-group">
                <label>编码</label>
                <input type="text" id="dictCode" value="${item.dictCode || ''}">
            </div>
            <div class="form-group">
                <label>名称</label>
                <input type="text" id="dictName" value="${item.dictName || ''}">
            </div>
            <div class="form-group">
                <label>描述</label>
                <textarea id="dictDesc">${item.dictDesc || ''}</textarea>
            </div>
            ${isHazard ? '' : `
            <div class="form-group">
                <label>关联危险源编码</label>
                <input type="text" id="hazardCode" value="${item.hazardCode || ''}">
            </div>
            <div class="form-group">
                <label>优先级</label>
                <input type="number" id="measurePriority" value="${item.priority || 1}" min="1" max="10">
            </div>
            `}
        `;
        document.getElementById('modalSubmit').onclick = submitDictEdit;
        document.getElementById('modalOverlay').style.display = 'flex';
    } catch (error) {
        console.error('加载字典数据失败:', error);
        alert('加载字典数据失败');
    }
}

async function submitDictEdit() {
    const id = document.getElementById('dictEditId').value;
    const type = document.getElementById('dictEditType').value;
    const isHazard = type === 'hazard';
    
    const data = {
        dictCode: document.getElementById('dictCode').value,
        dictName: document.getElementById('dictName').value,
        dictDesc: document.getElementById('dictDesc').value
    };
    
    if (!isHazard) {
        data.hazardCode = document.getElementById('hazardCode').value;
        data.priority = parseInt(document.getElementById('measurePriority').value);
    }
    
    const url = isHazard ? `${API_BASE_URL}/dict/hazard/${id}` : `${API_BASE_URL}/dict/measure/${id}`;
    
    try {
        const response = await apiFetch(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            if (isHazard) {
                loadHazardDict();
            } else {
                loadMeasureDict();
            }
        } else {
            const errorData = await response.json();
            alert('更新失败: ' + (errorData.message || '未知错误'));
        }
    } catch (error) {
        console.error('更新失败:', error);
        alert('更新失败，请重试');
    }
}

async function deleteItem(tableId, id) {
    if (!confirm('确定要删除吗？')) return;
    
    let url = '';
    if (tableId === 'tasksTable') url = `${API_BASE_URL}/tasks/${id}`;
    else if (tableId === 'hazardsTable') url = `${API_BASE_URL}/hazards/${id}`;
    else if (tableId === 'disclosuresTable') url = `${API_BASE_URL}/disclosures/${id}`;
    else if (tableId === 'casesTable') url = `${API_BASE_URL}/accident-cases/${id}`;
    
    console.log('删除 - tableId:', tableId, 'id:', id, 'url:', url);
    
    try {
        const response = await apiFetch(url, { method: 'DELETE' });
        console.log('删除响应状态:', response.status);
        
        if (response.ok) {
            loadDashboardData();
            if (tableId === 'tasksTable') loadTasks();
            if (tableId === 'hazardsTable') loadHazards();
            if (tableId === 'disclosuresTable') loadDisclosures();
            if (tableId === 'casesTable') loadCases();
        } else {
            const errorText = await response.text();
            console.error('删除失败:', errorText);
            alert('删除失败: ' + errorText);
        }
    } catch (error) {
        console.error('删除异常:', error);
        alert('删除失败，请重试: ' + error.message);
    }
}

async function deleteDictItem(tableId, id) {
    if (!confirm('确定要删除吗？')) return;
    
    let url = '';
    if (tableId === 'hazardDictTable') url = `${API_BASE_URL}/dict/hazard/${id}`;
    else if (tableId === 'measureDictTable') url = `${API_BASE_URL}/dict/measure/${id}`;
    
    console.log('删除字典 - tableId:', tableId, 'id:', id, 'url:', url);
    
    try {
        const response = await apiFetch(url, { method: 'DELETE' });
        console.log('删除字典响应状态:', response.status);
        
        if (response.ok) {
            if (tableId === 'hazardDictTable') loadHazardDict();
            if (tableId === 'measureDictTable') loadMeasureDict();
        } else {
            const errorText = await response.text();
            console.error('删除字典失败:', errorText);
            alert('删除失败: ' + errorText);
        }
    } catch (error) {
        console.error('删除字典异常:', error);
        alert('删除失败，请重试: ' + error.message);
    }
}

function showProfile() {
    window.location.href = 'profile.html';
}

function viewDisclosure(id) {
    window.location.href = `disclosure-detail.html?id=${id}`;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
}

let currentTaskId = null;
let currentHazards = [];
let currentDisclosure = null;

function agentParseTask() {
    const taskText = document.getElementById('agentTaskText').value.trim();
    if (!taskText) {
        alert('请输入作业任务描述');
        return;
    }

    apiFetch(`${API_BASE_URL}/agent/parse`, {
        method: 'POST',
        body: JSON.stringify({ taskText })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('parseVoltage').textContent = data.voltageLevel || '未知';
        document.getElementById('parseEquipment').textContent = data.equipmentType || '未知';
        document.getElementById('parseWorkType').textContent = data.workType || '未知';
        document.getElementById('parseEnvironment').textContent = data.envConditions || '正常';
        document.getElementById('parseLocation').textContent = data.location || '未知';
        
        showStep(2);
    })
    .catch(error => console.error('解析任务失败:', error));
}

function agentIdentifyHazards() {
    const taskName = document.getElementById('agentTaskName').value.trim() || '未命名任务';
    const taskDesc = document.getElementById('agentTaskDesc').value.trim();
    const taskText = document.getElementById('agentTaskText').value.trim();

    apiFetch(`${API_BASE_URL}/agent/create-task`, {
        method: 'POST',
        body: JSON.stringify({ taskName, taskDesc, taskText })
    })
    .then(response => response.json())
    .then(task => {
        currentTaskId = task.id;
        
        return apiFetch(`${API_BASE_URL}/agent/task/${task.id}/identify-hazards`, {
            method: 'POST'
        });
    })
    .then(response => response.json())
    .then(hazards => {
        currentHazards = hazards;
        renderAgentHazards(hazards);
        showStep(3);
    })
    .catch(error => console.error('识别危险点失败:', error));
}

function renderAgentHazards(hazards) {
    const container = document.getElementById('agentHazardList');
    container.innerHTML = '';

    if (hazards.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.4); text-align: center; padding: 20px;">未识别到危险点</p>';
        return;
    }

    hazards.forEach(hazard => {
        const div = document.createElement('div');
        div.className = 'hazard-card';
        div.innerHTML = `
            <div class="hazard-header">
                <span class="hazard-name">${hazard.hazardName}</span>
                <span class="hazard-level ${hazard.hazardLevel}">${getRiskLevelText(hazard.hazardLevel)}</span>
            </div>
            <div class="hazard-category">类别：${hazard.category}</div>
            <div class="hazard-desc">${hazard.description}</div>
        `;
        container.appendChild(div);
    });
}

function agentGenerateMeasures() {
    const measurePromises = currentHazards.map(h => 
        apiFetch(`${API_BASE_URL}/agent/hazard/${h.id}/generate-measures`, { method: 'POST' })
            .then(r => r.json())
    );

    Promise.all(measurePromises)
    .then(results => {
        const allMeasures = results.flat();
        renderAgentMeasures(allMeasures);
        showStep(4);
    })
    .catch(error => console.error('生成措施失败:', error));
}

function renderAgentMeasures(measures) {
    const container = document.getElementById('agentMeasureList');
    container.innerHTML = '';

    if (measures.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.4); text-align: center; padding: 20px;">暂无控制措施</p>';
        return;
    }

    measures.forEach(measure => {
        const div = document.createElement('div');
        div.className = 'measure-card';
        div.innerHTML = `
            <div class="measure-header">
                <span class="measure-priority">${measure.priority}</span>
                <span class="measure-name">${measure.measureName}</span>
            </div>
            <div class="measure-desc">${measure.measureDesc}</div>
        `;
        container.appendChild(div);
    });
}

function agentGenerateDisclosure() {
    apiFetch(`${API_BASE_URL}/agent/task/${currentTaskId}/generate-disclosure`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(disclosure => {
        currentDisclosure = disclosure;
        renderDisclosureCard(disclosure);
        showStep(5);
    })
    .catch(error => console.error('生成交底卡失败:', error));
}

function renderDisclosureCard(disclosure) {
    const container = document.getElementById('agentDisclosureCard');
    container.innerHTML = `
        <div class="disclosure-header">
            <div class="disclosure-title">${disclosure.title}</div>
            <div class="disclosure-no">编号：${disclosure.disclosureNo}</div>
        </div>
        <div class="disclosure-content">
            ${disclosure.content.replace(/\n/g, '<br>')}
        </div>
        <div class="disclosure-footer">
            <div>创建时间：${formatDate(disclosure.createTime)}</div>
            <div>状态：${getStatusText(disclosure.disclosureStatus)}</div>
        </div>
    `;
}

function showStep(stepNumber) {
    document.querySelectorAll('.agent-step').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('step' + stepNumber).classList.add('active');
}

function playDisclosure() {
    if (!currentDisclosure) return;
    
    const text = currentDisclosure.content;
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.8;
        window.speechSynthesis.speak(utterance);
    } else {
        alert('您的浏览器不支持语音播报');
    }
}

function openSignModal() {
    document.getElementById('modalTitle').textContent = '电子签名确认';
    document.getElementById('modalBody').innerHTML = `
        <div class="sign-container">
            <canvas id="signCanvas" width="400" height="200"></canvas>
            <div class="sign-actions">
                <button class="btn-secondary" onclick="clearSign()">清除</button>
                <button class="btn-primary" onclick="saveSign()">确认签名</button>
            </div>
        </div>
    `;
    initSignCanvas();
    document.getElementById('modalOverlay').style.display = 'flex';
}

function initSignCanvas() {
    const canvas = document.getElementById('signCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    canvas.addEventListener('mousedown', e => {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    
    canvas.addEventListener('mousemove', e => {
        if (!isDrawing) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
}

function clearSign() {
    const canvas = document.getElementById('signCanvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function saveSign() {
    const canvas = document.getElementById('signCanvas');
    const signImage = canvas.toDataURL('image/png');
    
    alert('签名保存成功！');
    closeModal();
}

function downloadDisclosure() {
    if (!currentDisclosure) return;
    
    const downloadModal = document.createElement('div');
    downloadModal.className = 'download-modal';
    downloadModal.innerHTML = `
        <div class="download-modal-content">
            <h3>选择下载格式</h3>
            <div class="download-options">
                <button class="btn-primary" onclick="downloadAsWord()">📄 Word文档</button>
                <button class="btn-secondary" onclick="downloadAsPdf()">📕 PDF文档</button>
            </div>
            <button class="btn-cancel" onclick="closeDownloadModal()">取消</button>
        </div>
    `;
    document.body.appendChild(downloadModal);
}

function downloadAsWord() {
    if (!currentDisclosure) return;
    const token = localStorage.getItem('token');
    const url = `${API_BASE_URL}/disclosures/${currentDisclosure.id}/download/word`;
    
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.responseType = 'blob';
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            const blob = new Blob([xhr.response], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentDisclosure.title + '.docx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            alert('下载失败');
        }
        closeDownloadModal();
    };
    
    xhr.onerror = function() {
        alert('下载失败');
        closeDownloadModal();
    };
    
    xhr.send();
}

function downloadAsPdf() {
    if (!currentDisclosure) return;
    const token = localStorage.getItem('token');
    const url = `${API_BASE_URL}/disclosures/${currentDisclosure.id}/download/pdf`;
    
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.responseType = 'blob';
    
    xhr.onload = function() {
        if (xhr.status === 200) {
            const blob = new Blob([xhr.response], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentDisclosure.title + '.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            alert('下载失败');
        }
        closeDownloadModal();
    };
    
    xhr.onerror = function() {
        alert('下载失败');
        closeDownloadModal();
    };
    
    xhr.send();
}

function closeDownloadModal() {
    const modal = document.querySelector('.download-modal');
    if (modal) {
        modal.remove();
    }
}

// 侧边栏导航切换函数（与HTML中onclick调用的switchModule对齐）
function switchModule(module) {
    showModule(module);
    // 更新侧边栏激活状态
    document.querySelectorAll('.pc-sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector('.pc-sidebar-item[data-module="' + module + '"]');
    if (activeItem) {
        activeItem.classList.add('active');
    }
    // 更新URL参数（不刷新页面）
    const url = new URL(window.location);
    url.searchParams.set('module', module);
    window.history.pushState({}, '', url);
    return false;
}

// 全局数据缓存，用于搜索过滤
let allTasks = [];
let allHazards = [];
let allDisclosures = [];
let allCases = [];

// 改进数据加载函数，添加缓存
const originalLoadTasks = loadTasks;
loadTasks = async function() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/tasks`);
        const tasks = await response.json();
        allTasks = tasks;
        renderTable('tasksTable', tasks, ['id', 'taskName', 'taskType', 'status', 'createTime'], ['ID', '任务名称', '任务类型', '状态', '创建时间']);
    } catch (error) {
        console.error('加载任务失败:', error);
        showEmptyState('tasksTable', '加载失败，请刷新重试');
    }
};

const originalLoadHazards = loadHazards;
loadHazards = async function() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/hazards`);
        const hazards = await response.json();
        allHazards = hazards;
        renderTable('hazardsTable', hazards, ['id', 'hazardName', 'category', 'hazardLevel', 'location'], ['ID', '危险源名称', '类别', '风险等级', '位置']);
    } catch (error) {
        console.error('加载危险源失败:', error);
        showEmptyState('hazardsTable', '加载失败，请刷新重试');
    }
};

const originalLoadDisclosures = loadDisclosures;
loadDisclosures = async function() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/disclosures`);
        const disclosures = await response.json();
        allDisclosures = disclosures;
        renderTable('disclosuresTable', disclosures, ['id', 'title', 'disclosureType', 'disclosureStatus', 'createTime'], ['ID', '标题', '交底类型', '状态', '创建时间']);
    } catch (error) {
        console.error('加载交底失败:', error);
        showEmptyState('disclosuresTable', '加载失败，请刷新重试');
    }
};

const originalLoadCases = loadCases;
loadCases = async function() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/accident-cases`);
        const cases = await response.json();
        allCases = cases;
        renderTable('casesTable', cases, ['id', 'caseName', 'accidentType', 'severity', 'occurTime'], ['ID', '案例名称', '事故类型', '严重程度', '发生时间']);
    } catch (error) {
        console.error('加载案例失败:', error);
        showEmptyState('casesTable', '加载失败，请刷新重试');
    }
};

// 显示空状态
function showEmptyState(tableId, message) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const cols = table.querySelectorAll('thead th').length;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="empty-state">${message}</td></tr>`;
}

// 搜索过滤功能
function filterTasks() {
    const searchTerm = document.getElementById('taskSearch').value.toLowerCase();
    const statusFilter = document.getElementById('taskStatusFilter').value;
    
    let filtered = allTasks.filter(task => {
        const matchSearch = !searchTerm || 
            (task.taskName && task.taskName.toLowerCase().includes(searchTerm)) ||
            (task.taskType && task.taskType.toLowerCase().includes(searchTerm));
        const matchStatus = !statusFilter || task.status === statusFilter;
        return matchSearch && matchStatus;
    });
    
    renderTable('tasksTable', filtered, ['id', 'taskName', 'taskType', 'status', 'createTime'], ['ID', '任务名称', '任务类型', '状态', '创建时间']);
}

function filterHazards() {
    const searchTerm = document.getElementById('hazardSearch').value.toLowerCase();
    
    let filtered = allHazards.filter(hazard => {
        return !searchTerm || 
            (hazard.hazardName && hazard.hazardName.toLowerCase().includes(searchTerm)) ||
            (hazard.category && hazard.category.toLowerCase().includes(searchTerm)) ||
            (hazard.location && hazard.location.toLowerCase().includes(searchTerm));
    });
    
    renderTable('hazardsTable', filtered, ['id', 'hazardName', 'category', 'hazardLevel', 'location'], ['ID', '危险源名称', '类别', '风险等级', '位置']);
}

function filterDisclosures() {
    const searchTerm = document.getElementById('disclosureSearch').value.toLowerCase();
    
    let filtered = allDisclosures.filter(disclosure => {
        return !searchTerm || 
            (disclosure.title && disclosure.title.toLowerCase().includes(searchTerm)) ||
            (disclosure.disclosureType && disclosure.disclosureType.toLowerCase().includes(searchTerm));
    });
    
    renderTable('disclosuresTable', filtered, ['id', 'title', 'disclosureType', 'disclosureStatus', 'createTime'], ['ID', '标题', '交底类型', '状态', '创建时间']);
}

function filterCases() {
    const searchTerm = document.getElementById('caseSearch').value.toLowerCase();
    
    let filtered = allCases.filter(c => {
        return !searchTerm || 
            (c.caseName && c.caseName.toLowerCase().includes(searchTerm)) ||
            (c.accidentType && c.accidentType.toLowerCase().includes(searchTerm));
    });
    
    renderTable('casesTable', filtered, ['id', 'caseName', 'accidentType', 'severity', 'occurTime'], ['ID', '案例名称', '事故类型', '严重程度', '发生时间']);
}

// 字典标签切换
function switchDictTab(tab) {
    const tabBtns = document.querySelectorAll('.dict-tabs .tab-btn');
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('hazardDictSection').style.display = tab === 'hazard' ? 'block' : 'none';
    document.getElementById('measureDictSection').style.display = tab === 'measure' ? 'block' : 'none';
}

// 改进首页数据加载的错误处理
const originalLoadDashboardData = loadDashboardData;
loadDashboardData = async function() {
    try {
        const results = await Promise.allSettled([
            apiFetch(`${API_BASE_URL}/tasks`),
            apiFetch(`${API_BASE_URL}/hazards`),
            apiFetch(`${API_BASE_URL}/disclosures`),
            apiFetch(`${API_BASE_URL}/accident-cases`)
        ]);
        
        let tasks = [], hazards = [], disclosures = [], cases = [];
        
        if (results[0].status === 'fulfilled' && results[0].value.ok) {
            tasks = await results[0].value.json();
            allTasks = tasks;
        }
        if (results[1].status === 'fulfilled' && results[1].value.ok) {
            hazards = await results[1].value.json();
            allHazards = hazards;
        }
        if (results[2].status === 'fulfilled' && results[2].value.ok) {
            disclosures = await results[2].value.json();
            allDisclosures = disclosures;
        }
        if (results[3].status === 'fulfilled' && results[3].value.ok) {
            cases = await results[3].value.json();
            allCases = cases;
        }
        
        document.getElementById('taskCount').textContent = tasks.length || 0;
        document.getElementById('hazardCount').textContent = hazards.length || 0;
        document.getElementById('disclosureCount').textContent = disclosures.length || 0;
        document.getElementById('caseCount').textContent = cases.length || 0;
        
        renderRecentTasks(tasks.slice(0, 5));
        renderHazardDistribution(hazards);
        
    } catch (error) {
        console.error('加载数据失败:', error);
    }
};

// 改进renderRecentTasks使用新样式
const originalRenderRecentTasks = renderRecentTasks;
renderRecentTasks = function(tasks) {
    const container = document.getElementById('recentTasks');
    container.innerHTML = '';
    
    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无任务数据</div>';
        return;
    }
    
    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <span class="task-name">${task.taskName || '未命名任务'}</span>
            <span class="task-status ${task.status || 'pending'}">${getStatusText(task.status)}</span>
        `;
        container.appendChild(div);
    });
};

// 改进renderHazardDistribution使用新样式
const originalRenderHazardDistribution = renderHazardDistribution;
renderHazardDistribution = function(hazards) {
    const container = document.getElementById('hazardDistribution');
    container.innerHTML = '';
    
    if (hazards.length === 0) {
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">暂无危险源数据</div>';
        return;
    }
    
    const categories = {};
    hazards.forEach(h => {
        const cat = h.category || '未分类';
        categories[cat] = (categories[cat] || 0) + 1;
    });
    
    Object.keys(categories).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'hazard-item';
        div.innerHTML = `
            <div class="hazard-count">${categories[cat]}</div>
            <div class="hazard-name">${cat}</div>
        `;
        container.appendChild(div);
    });
};

// 改进renderTable使用新的空状态样式
const originalRenderTable = renderTable;
renderTable = function(tableId, data, fields, headers) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${headers.length}" class="empty-state">暂无数据</td></tr>`;
        return;
    }
    
    data.forEach(item => {
        const row = document.createElement('tr');
        let html = '';
        
        fields.forEach(field => {
            let value = item[field];
            if (field === 'status' || field === 'disclosureStatus') {
                const statusValue = item[field] || item['status'];
                value = `<span class="task-status ${statusValue}">${getStatusText(statusValue)}</span>`;
            } else if (field === 'createTime' || field === 'occurTime') {
                value = formatDate(value);
            } else if (field === 'hazardLevel') {
                value = getRiskLevelText(value);
            } else if (field === 'severity') {
                value = getSeverityText(value);
            }
            html += `<td>${value !== undefined && value !== null ? value : '-'}</td>`;
        });
        
        let detailBtn = '';
        if (tableId === 'disclosuresTable') {
            detailBtn = `<button class="action-btn detail" onclick="viewDisclosure(${item.id})">详情</button>`;
        }
        
        html += `
            <td>
                <div class="action-buttons">
                    ${detailBtn}
                    <button class="action-btn edit" data-action="edit" data-table="${tableId}" data-id="${item.id}">编辑</button>
                    <button class="action-btn delete" data-action="delete" data-table="${tableId}" data-id="${item.id}">删除</button>
                </div>
            </td>
        `;
        
        row.innerHTML = html;
        tbody.appendChild(row);
    });
};