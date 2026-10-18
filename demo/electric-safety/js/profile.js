const API_BASE_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadUserInfo();
    initProfileTabs();
});

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
    }
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    };
}

function initProfileTabs() {
    const tabs = document.querySelectorAll('.profile-tabs .tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const sectionId = this.getAttribute('data-tab') + 'Section';
            document.querySelectorAll('.profile-section').forEach(s => s.style.display = 'none');
            document.getElementById(sectionId).style.display = 'block';
            
            if (sectionId === 'recordSection') {
                loadOperationRecords();
            }
        });
    });
}

async function loadUserInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/user-info`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const user = await response.json();
            document.getElementById('profileUsername').textContent = user.username || '用户';
            document.getElementById('usernameDisplay').textContent = user.username || '用户';
            document.getElementById('profileRole').textContent = user.role === 'manager' ? '管理员' : user.role === 'supervisor' ? '监理' : '操作员';
            
            document.getElementById('editUsername').value = user.username || '';
            document.getElementById('editRealName').value = user.realName || '';
            document.getElementById('editPhone').value = user.phone || '';
            document.getElementById('editEmail').value = user.email || '';
            document.getElementById('editDepartment').value = user.department || '';
            document.getElementById('editRole').value = user.role || 'operator';
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('加载用户信息失败:', error);
    }
}

async function saveProfile() {
    const data = {
        username: document.getElementById('editUsername').value,
        realName: document.getElementById('editRealName').value,
        phone: document.getElementById('editPhone').value,
        email: document.getElementById('editEmail').value,
        department: document.getElementById('editDepartment').value,
        role: document.getElementById('editRole').value
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/update-profile`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('保存成功');
            loadUserInfo();
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        } else {
            throw new Error('保存失败');
        }
    } catch (error) {
        console.error('保存失败:', error);
        alert('保存失败，请重试');
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('请填写所有密码字段');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('两次输入的新密码不一致');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        if (response.ok) {
            alert('密码修改成功，请重新登录');
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        } else {
            const error = await response.json();
            alert(error.message || '密码修改失败');
        }
    } catch (error) {
        console.error('修改密码失败:', error);
        alert('修改密码失败，请重试');
    }
}

async function loadOperationRecords() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/operation-records`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const records = await response.json();
            const tbody = document.getElementById('recordTable').querySelector('tbody');
            tbody.innerHTML = '';
            
            records.forEach(record => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${record.createTime || '-'}</td>
                    <td>${record.operationType || '-'}</td>
                    <td>${record.description || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('加载操作记录失败:', error);
    }
}