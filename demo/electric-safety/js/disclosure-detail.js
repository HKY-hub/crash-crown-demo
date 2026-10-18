const API_BASE_URL = '/api';
let currentDisclosureId = null;

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
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id) {
        currentDisclosureId = parseInt(id);
        loadDisclosureDetail(currentDisclosureId);
    }
});

function goBack() {
    window.location.href = 'dashboard.html?module=disclosures';
}

async function loadDisclosureDetail(id) {
    try {
        const disclosureRes = await apiFetch(`${API_BASE_URL}/disclosures/${id}`);
        if (!disclosureRes.ok) {
            throw new Error('交底记录不存在');
        }
        const disclosure = await disclosureRes.json();
        
        const taskId = disclosure.taskId;
        
        // 分别加载各数据，单个失败不影响整体
        let task = null;
        let hazards = [];
        let measures = [];
        
        try {
            const taskRes = await apiFetch(`${API_BASE_URL}/tasks/${taskId}`);
            if (taskRes.ok && taskRes.headers.get('content-length') !== '0') {
                const text = await taskRes.text();
                if (text && text.trim()) {
                    task = JSON.parse(text);
                }
            }
        } catch (e) {
            console.warn('加载任务信息失败:', e);
        }
        
        try {
            const hazardsRes = await apiFetch(`${API_BASE_URL}/hazards/task/${taskId}`);
            if (hazardsRes.ok) {
                hazards = await hazardsRes.json();
            }
        } catch (e) {
            console.warn('加载危险点失败:', e);
        }
        
        try {
            const measuresRes = await apiFetch(`${API_BASE_URL}/safety-measures/task/${taskId}`);
            if (measuresRes.ok) {
                measures = await measuresRes.json();
            }
        } catch (e) {
            console.warn('加载安全措施失败:', e);
        }
        
        // 填充交底卡基本信息
        document.getElementById('detailTitle').textContent = disclosure.title || '安全交底卡';
        document.getElementById('detailNo').textContent = '编号：' + (disclosure.disclosureNo || '-');
        document.getElementById('detailType').textContent = disclosure.disclosureType || '-';
        
        const statusBadge = document.getElementById('detailStatus');
        statusBadge.textContent = disclosure.disclosureStatus === 'published' ? '已发布' : '草稿';
        statusBadge.className = 'info-value status-badge ' + disclosure.disclosureStatus;
        
        document.getElementById('detailCreateTime').textContent = formatTime(disclosure.createTime) || '-';
        document.getElementById('detailUpdateTime').textContent = formatTime(disclosure.updateTime) || '-';
        
        document.getElementById('detailContent').innerHTML = renderMarkdown(disclosure.content || '暂无内容');
        document.getElementById('detailEmergencyContact').textContent = disclosure.emergencyContact || '-';
        document.getElementById('detailEmergencyRoute').textContent = disclosure.emergencyRoute || '-';
        
        // 填充任务信息（任务可能不存在）
        if (task) {
            document.getElementById('taskName').textContent = task.taskName || '-';
            document.getElementById('taskVoltage').textContent = task.voltageLevel || '-';
            document.getElementById('taskEquipment').textContent = task.equipmentType || '-';
            document.getElementById('taskWorkType').textContent = task.workType || '-';
        } else {
            // 从交底卡标题或内容中提取任务名
            document.getElementById('taskName').textContent = extractTaskName(disclosure) || '-';
            document.getElementById('taskVoltage').textContent = '-';
            document.getElementById('taskEquipment').textContent = '-';
            document.getElementById('taskWorkType').textContent = '-';
        }
        
        renderHazards(hazards);
        renderMeasures(measures);
        
    } catch (error) {
        console.error('加载详情失败:', error);
        alert('加载详情失败：' + error.message);
    }
}

function formatTime(timeStr) {
    if (!timeStr) return '-';
    try {
        const d = new Date(timeStr);
        if (isNaN(d.getTime())) return timeStr;
        return d.getFullYear() + '-' + 
               String(d.getMonth() + 1).padStart(2, '0') + '-' + 
               String(d.getDate()).padStart(2, '0') + ' ' +
               String(d.getHours()).padStart(2, '0') + ':' +
               String(d.getMinutes()).padStart(2, '0');
    } catch {
        return timeStr;
    }
}

function extractTaskName(disclosure) {
    if (!disclosure) return '';
    if (disclosure.title) {
        // 从标题中提取："安全交底卡 - xxx"
        const idx = disclosure.title.indexOf(' - ');
        if (idx > 0) return disclosure.title.substring(idx + 3);
    }
    return '';
}

function renderHazards(hazards) {
    const container = document.getElementById('detailHazards');
    if (!hazards || hazards.length === 0) {
        container.innerHTML = '<p style="color:#999;">暂无危险点数据</p>';
        return;
    }
    
    container.innerHTML = hazards.map(hazard => `
        <div class="hazard-card">
            <div class="hazard-header">
                <span class="hazard-name">${hazard.hazardName || '-'}</span>
                <span class="hazard-level ${hazard.hazardLevel || 'low'}">${getLevelText(hazard.hazardLevel)}</span>
            </div>
            <div class="hazard-category">${hazard.category || '-'}</div>
            <div class="hazard-desc">${hazard.description || '-'}</div>
        </div>
    `).join('');
}

function renderMeasures(measures) {
    const container = document.getElementById('detailMeasures');
    if (!measures || measures.length === 0) {
        container.innerHTML = '<p style="color:#999;">暂无安全控制措施</p>';
        return;
    }
    
    container.innerHTML = measures.map(measure => `
        <div class="measure-card">
            <div class="measure-header">
                <span class="measure-priority">优先级 ${measure.priority || 1}</span>
                <span class="measure-name">${measure.measureName || '-'}</span>
            </div>
            <div class="measure-desc">${measure.measureDesc || '-'}</div>
        </div>
    `).join('');
}

function getLevelText(level) {
    if (!level) return '一般';
    switch(level) {
        case 'high': return '高风险';
        case 'medium': return '中风险';
        case 'low': return '低风险';
        case '特别重大': return '特别重大';
        case '重大': return '重大';
        case '较大': return '较大';
        case '一般': return '一般';
        case '严重': return '严重';
        default: return '一般';
    }
}

function renderMarkdown(text) {
    let html = text;
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-size:16px;font-weight:bold;color:#4CAF50;margin:12px 0 8px 0;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-size:18px;font-weight:bold;color:#333;margin:16px 0 10px 0;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="font-size:20px;font-weight:bold;color:#333;margin:20px 0 12px 0;">$1</h1>');
    html = html.replace(/^\|(.+)\|$/gm, function(match) {
        const cells = match.split('|').filter(c => c.trim() !== '');
        if (cells.length === 0) return match;
        const isHeader = cells.some(cell => cell.trim().includes('---'));
        if (isHeader) return '';
        let rowHtml = '<tr>';
        cells.forEach(cell => {
            rowHtml += '<td style="border:1px solid #ddd;padding:8px 12px;text-align:left;vertical-align:top;">' + cell.trim() + '</td>';
        });
        rowHtml += '</tr>';
        return rowHtml;
    });
    html = html.replace(/(<tr>[\s\S]*?<\/tr>)+/g, '<table style="width:100%;border-collapse:collapse;margin:8px 0;border-radius:8px;overflow:hidden;">$&</table>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#333;font-weight:bold;">$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em style="font-style:italic;">$1</em>');
    html = html.replace(/^\- (.+)$/gm, '<li style="margin-left:20px;color:#333;">$1</li>');
    html = html.replace(/(<li>.+<\/li>)+/g, '<ul style="margin:8px 0;">$&</ul>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

function downloadDemoFile(filename, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function loadDisclosureForDownload() {
    const response = await apiFetch(`${API_BASE_URL}/disclosures/${currentDisclosureId}`);
    if (!response.ok) throw new Error('获取交底信息失败');
    return response.json();
}

async function downloadWord() {
    if (!currentDisclosureId) return;
    try {
        const disclosure = await loadDisclosureForDownload();
        const text = [
            disclosure.title || '安全交底卡',
            '编号：' + (disclosure.disclosureNo || '-'),
            '交底类型：' + (disclosure.disclosureType || '-'),
            '创建时间：' + (disclosure.createTime || '-'),
            '',
            (disclosure.content || '').replace(/^#+\s*/gm, '')
        ].join('\n');
        downloadDemoFile('安全交底卡-演示.txt', text, 'text/plain;charset=utf-8');
    } catch (error) {
        alert('导出失败：' + error.message);
    }
}

async function downloadPdf() {
    if (!currentDisclosureId) return;
    try {
        const disclosure = await loadDisclosureForDownload();
        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>' +
            escapeHtml(disclosure.title) + '</title><style>body{font:16px/1.8 "Microsoft YaHei",sans-serif;max-width:820px;margin:40px auto;padding:0 24px;color:#222}h1{font-size:24px}pre{white-space:pre-wrap;font:inherit}</style>' +
            '<h1>' + escapeHtml(disclosure.title) + '</h1><p>编号：' + escapeHtml(disclosure.disclosureNo) +
            ' · 演示导出</p><pre>' + escapeHtml(disclosure.content) + '</pre></html>';
        downloadDemoFile('安全交底卡-演示.html', html, 'text/html;charset=utf-8');
    } catch (error) {
        alert('导出失败：' + error.message);
    }
}

async function playDisclosure() {
    if (!currentDisclosureId) return;
    try {
        const disclosure = await loadDisclosureForDownload();
        const text = String(disclosure.content || '').replace(/[#>*`|-]/g, ' ').replace(/\s+/g, ' ');
        if (!('speechSynthesis' in window)) {
            alert('当前浏览器不支持语音播报。');
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1;
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.error('语音播放失败:', error);
        alert('语音播放失败，请重试');
    }
}

let currentSignType = '';
let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

function openSignatureModal(type) {
    currentSignType = type;
    const modal = document.getElementById('signatureModal');
    modal.classList.add('show');
    
    if (!signatureCanvas) {
        signatureCanvas = document.getElementById('signatureCanvas');
        signatureCtx = signatureCanvas.getContext('2d');
        initSignatureCanvas();
    }
    
    clearSignature();
}

function closeSignatureModal() {
    const modal = document.getElementById('signatureModal');
    modal.classList.remove('show');
    currentSignType = '';
}

function initSignatureCanvas() {
    signatureCanvas.addEventListener('mousedown', startDrawing);
    signatureCanvas.addEventListener('mousemove', draw);
    signatureCanvas.addEventListener('mouseup', stopDrawing);
    signatureCanvas.addEventListener('mouseout', stopDrawing);
    
    signatureCanvas.addEventListener('touchstart', startDrawing);
    signatureCanvas.addEventListener('touchmove', draw);
    signatureCanvas.addEventListener('touchend', stopDrawing);
}

function startDrawing(e) {
    isDrawing = true;
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    
    if (e.touches) {
        lastX = e.touches[0].clientX - rect.left;
        lastY = e.touches[0].clientY - rect.top;
    } else {
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
    }
    
    lastX *= scaleX;
    lastY *= scaleY;
}

function draw(e) {
    if (!isDrawing) return;
    
    const rect = signatureCanvas.getBoundingClientRect();
    const scaleX = signatureCanvas.width / rect.width;
    const scaleY = signatureCanvas.height / rect.height;
    
    let currentX, currentY;
    if (e.touches) {
        currentX = e.touches[0].clientX - rect.left;
        currentY = e.touches[0].clientY - rect.top;
    } else {
        currentX = e.clientX - rect.left;
        currentY = e.clientY - rect.top;
    }
    
    currentX *= scaleX;
    currentY *= scaleY;
    
    signatureCtx.beginPath();
    signatureCtx.strokeStyle = '#333';
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
    signatureCtx.moveTo(lastX, lastY);
    signatureCtx.lineTo(currentX, currentY);
    signatureCtx.stroke();
    
    lastX = currentX;
    lastY = currentY;
}

function stopDrawing() {
    isDrawing = false;
}

function clearSignature() {
    if (signatureCtx && signatureCanvas) {
        signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        signatureCtx.fillStyle = '#fff';
        signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    }
}

function confirmSignature() {
    const dataURL = signatureCanvas.toDataURL('image/png');
    
    if (currentSignType === 'issuer') {
        document.getElementById('issuerSignature').src = dataURL;
        document.getElementById('issuerSignature').style.display = 'block';
        document.getElementById('issuerCanvas').style.display = 'none';
        document.getElementById('issuerHint').style.display = 'none';
    } else if (currentSignType === 'receiver') {
        document.getElementById('receiverSignature').src = dataURL;
        document.getElementById('receiverSignature').style.display = 'block';
        document.getElementById('receiverCanvas').style.display = 'none';
        document.getElementById('receiverHint').style.display = 'none';
    }
    
    closeSignatureModal();
}

async function saveSignatures() {
    try {
        const issuerImg = document.getElementById('issuerSignature');
        const receiverImg = document.getElementById('receiverSignature');
        const disclosureTime = document.getElementById('disclosureTime').value;
        const confirmTime = document.getElementById('confirmTime').value;
        
        const issuerSignature = issuerImg ? issuerImg.src : '';
        const receiverSignature = receiverImg ? receiverImg.src : '';
        
        console.log('保存签名 - issuerSignature:', issuerSignature ? '有数据' : '空');
        console.log('保存签名 - receiverSignature:', receiverSignature ? '有数据' : '空');
        console.log('保存签名 - currentDisclosureId:', currentDisclosureId);
        
        if (!issuerSignature || issuerSignature === 'data:,') {
            alert('请先签署交底人签名');
            return;
        }
        if (!receiverSignature || receiverSignature === 'data:,') {
            alert('请先签署被交底人签名');
            return;
        }
        
        const data = {
            issuerSignature: issuerSignature,
            receiverSignature: receiverSignature,
            disclosureTime: disclosureTime,
            confirmTime: confirmTime
        };
        
        const response = await apiFetch(`${API_BASE_URL}/disclosures/${currentDisclosureId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        
        console.log('保存签名响应状态:', response.status);
        
        if (response.ok) {
            alert('签名保存成功！');
        } else {
            const errorText = await response.text();
            console.error('保存签名失败:', errorText);
            alert('保存签名失败: ' + errorText);
        }
    } catch (error) {
        console.error('保存签名异常:', error);
        alert('保存签名失败，请重试: ' + error.message);
    }
}