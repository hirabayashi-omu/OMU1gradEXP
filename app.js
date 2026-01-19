/**
 * Digital Lab Report System - Core Logic
 */

const defaultAppState = {
    activeView: 'dashboard',
    user: { className: '1年4組', attendanceId: '', studentName: '' },
    experiments: {
        day1: {
            title: '熱の可視化',
            info: { partners: [], seat: '', date: '' },
            safety: [false, false, false],
            tools: [], photos: { apparatus: null },
            data: { melting: { m1: '', m2: '', m3: '' }, transfer: [] },
            lit: { cu: '', al: '', sus: '', 'cu-url': '', 'al-url': '', 'sus-url': '' },
            method_text: '', // Added for Day 1 method/evaluation
            discussion: '',
            questions: [
                { label: '熱の伝わりやすさと熱伝導', text: '', keywords: ['熱伝導率', 'フーリエの法則', '温度勾配'], minChar: 200 },
                { label: '固体中の熱伝導のメカニズム', text: '', keywords: ['自由電子', '格子振動', 'フォノン'], minChar: 200 },
                { label: '材料による熱伝導率の違いと応用', text: '', keywords: ['結晶構造', '断熱材', '放熱性'], minChar: 200 }
            ],
            refs: [], scores: { effort: 0, report: 0 }
        },
        day2: {
            title: '燃料電池',
            info: { partners: [], seat: '', date: '' },
            safety: [false, false, false],
            tools: [], photos: { electrode: null, apparatus: null },
            data: { charge: [], dischargeA: [], dischargeB: [], dischargeC: [], assembly_method: '' },
            discussion: '',
            questions: [
                { label: 'アルカリ型燃料電池って何？', text: '', keywords: ['水素', 'アルカリ', '水'], minChar: 200 },
                { label: '電池で発電できる仕組みは？', text: '', keywords: ['反応性の違い', '起電力', '電子', 'イオン'], minChar: 200 },
                { label: '組み立てで大切な工夫は？', text: '', keywords: ['触媒', '電極', '安全'], minChar: 200 }
            ],
            refs: [], scores: { effort: 0, report: 0 }
        },
        day3: {
            title: '水処理',
            info: { partners: [], seat: '', date: '' },
            safety: [false, false, false],
            tools: [], photos: { target: null, p1_app: null, p1_wat: null, p2_app: null, p2_wat: null, coag: null },
            data: { p1_text: '', p2_text: '', coag_text: '', clarity: [0, 0, 0] },
            discussion: '',
            questions: [
                { label: '水の利用と機械の関係', text: '', keywords: ['浄水', '循環', 'ポンプ'], minChar: 200 },
                { label: '水の汚れとは？綺麗にする仕組み', text: '', keywords: ['ろ過', '沈殿', 'フィルター'], minChar: 200 },
                { label: '作製した装置で工夫したポイント', text: '', keywords: ['多孔質', '吸着', '物理的'], minChar: 200 }
            ],
            refs: [], scores: { effort: 0, report: 0 }
        }
    },
    history: []
};

let charts = {};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    populateAttendanceOptions();
    populateSeatOptions();
    loadState();
    updateUIFromState(); // CRITICAL: Sync UI with loaded state
    initEventListeners();
    renderAllQuestions();
    updateAllScores();
    switchView(appState.activeView);

    // Save on exit safety
    window.addEventListener('beforeunload', saveState);

    // Initial log if empty
    if (!appState.history || appState.history.length === 0) {
        addHistoryEntry('init', 'システムを開始しました', ['all']);
    }
    renderHistory();

    // Explicitly update default view's charts if needed
    if (appState.activeView === 'day1') updateChartD1();
});

// Emergency reset utility
window.resetApp = () => {
    if (confirm('全てのデータをリセットして初期状態に戻しますか？（保存されているデータは消去されます）')) {
        window.removeEventListener('beforeunload', saveState);
        localStorage.removeItem('digitalLab_V2');
        location.reload();
    }
};

function updateAllScores() {
    ['day1', 'day2', 'day3'].forEach(updateScores);
}

function populateAttendanceOptions(targetEl = null) {
    const defaultSelects = ['global-attendance', 'd1-self-id', 'd2-self-id', 'd3-self-id'];
    const selects = targetEl ? [targetEl] : [...defaultSelects, ...document.querySelectorAll('.partner-id-select')];

    selects.forEach(elOrId => {
        const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = '<option value="">番号</option>' +
            Array.from({ length: 50 }, (_, i) => {
                const num = (i + 1).toString().padStart(2, '0');
                return `<option value="${num}">${num}</option>`;
            }).join('');
        el.value = currentVal;
    });
}

function populateSeatOptions() {
    ['d1', 'd2', 'd3'].forEach(d => {
        const alpha = document.getElementById(`${d}-seat-alpha`);
        const num = document.getElementById(`${d}-seat-num`);
        if (!alpha || !num) return;

        alpha.innerHTML = '<option value="">-</option>' +
            'ABCDEFGHIJKLM'.split('').map(l => `<option value="${l}">${l}</option>`).join('');

        num.innerHTML = '<option value="">-</option>' +
            Array.from({ length: 41 }, (_, i) => {
                const n = i.toString().padStart(2, '0');
                return `<option value="${n}">${n}</option>`;
            }).join('');
    });
}

function initEventListeners() {
    // Nav
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.dataset.view);
            // Close mobile sidebar on item click
            if (window.innerWidth <= 900) {
                document.body.classList.remove('mobile-sidebar-open');
                const ov = document.getElementById('sidebar-overlay');
                if (ov) ov.classList.remove('active');
            }
        });
    });

    // Sidebar Toggle Logic
    const menuToggle = document.getElementById('menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            if (window.innerWidth <= 900) {
                document.body.classList.toggle('mobile-sidebar-open');
                if (overlay) overlay.classList.toggle('active', document.body.classList.contains('mobile-sidebar-open'));
            } else {
                document.body.classList.toggle('desktop-sidebar-closed');
            }
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            document.body.classList.remove('mobile-sidebar-open');
            overlay.classList.remove('active');
        });
    }


    // Global Info
    ['global-class', 'global-attendance', 'global-name'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventType = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(eventType, (e) => {
            const field = id.split('-')[1];
            if (field === 'class') appState.user.className = e.target.value;
            if (field === 'attendance') appState.user.attendanceId = e.target.value;
            if (field === 'name') appState.user.studentName = e.target.value;
            syncSideProfile();
            saveState();
            logEditHistory('基本情報を更新', ['all']);
        });
    });

    // Seat Selector Listeners
    ['d1', 'd2', 'd3'].forEach(d => {
        const updateSeat = () => {
            const alpha = document.getElementById(`${d}-seat-alpha`);
            const num = document.getElementById(`${d}-seat-num`);
            if (!alpha || !num) return;

            const letter = alpha.value;
            const number = num.value;
            const combined = (letter && number) ? `${letter}-${number}` : '';

            const txt = document.getElementById(`${d}-seat`);
            if (txt) txt.value = combined;

            const dayKey = `day${d.charAt(1)}`;
            appState.experiments[dayKey].info.seat = combined;
            saveState();
            updateScores(dayKey);
            logEditHistory(`${appState.experiments[dayKey].title} の座席番号を更新`, [dayKey]);
        };
        const alpha = document.getElementById(`${d}-seat-alpha`);
        const num = document.getElementById(`${d}-seat-num`);
        if (alpha) alpha.addEventListener('change', updateSeat);
        if (num) num.addEventListener('change', updateSeat);
    });

    // Day 1: Melting Avg
    ['d1-m1', 'd1-m2', 'd1-m3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', (e) => {
            const m1 = parseFloat(document.getElementById('d1-m1').innerText) || 0;
            const m2 = parseFloat(document.getElementById('d1-m2').innerText) || 0;
            const m3 = parseFloat(document.getElementById('d1-m3').innerText) || 0;
            const valid = [m1, m2, m3].filter(v => v > 0);
            const avg = valid.length > 0 ? (valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
            const avgStr = avg.toFixed(1);

            const tAvg = document.getElementById('d1-temp-avg');
            if (tAvg) tAvg.textContent = avgStr;

            const avgDisplay = document.getElementById('d1-avg-text');
            if (avgDisplay) avgDisplay.textContent = avgStr;

            appState.experiments.day1.data.melting = { m1, m2, m3 };
            saveState();
            updateScores('day1');
            if (e.isTrusted) logEditHistory('パラフィン融解温度を更新', ['day1']);
        });
    });

    // Reset All Data Button
    const resetBtn = document.getElementById('reset-all-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('全てのデータをリセットしますか？')) {
                window.removeEventListener('beforeunload', saveState);
                localStorage.removeItem('digitalLab_V2');
                location.reload();
            }
        });
    }

    // PDF Export (Top Menu)
    const topPdfBtn = document.getElementById('export-pdf-btn');
    if (topPdfBtn) {
        topPdfBtn.addEventListener('click', () => {
            const currentView = appState.activeView;
            if (['day1', 'day2', 'day3'].includes(currentView)) {
                window.generatePDF(currentView);
            } else {
                alert('実験ページ (Day 1〜3) を開いた状態でPDFを出力してください。');
            }
        });
    }

    // JSON Export
    const exportBtn = document.getElementById('export-json');
    if (exportBtn) exportBtn.addEventListener('click', window.exportJSON);

    // Day 1: Transfer Table
    const tTrans = document.getElementById('table-transfer-1');
    if (tTrans) {
        tTrans.addEventListener('input', (e) => {
            const rows = document.querySelectorAll('#table-transfer-1 tbody tr');
            appState.experiments.day1.data.transfer = Array.from(rows).map(row => {
                const cells = row.querySelectorAll('td');
                return [parseFloat(cells[0].innerText), parseFloat(cells[1].innerText) || null, parseFloat(cells[2].innerText) || null, parseFloat(cells[3].innerText) || null];
            });
            updateChartD1();
            saveState();
            updateAllScores(); // Use standard score update
            if (e.isTrusted) logEditHistory('伝熱実験データを更新', ['day1']);
        });
    }

    // Day 2: Charge Table
    const tCharge = document.getElementById('table-charge-2');
    if (tCharge) {
        tCharge.addEventListener('input', (e) => {
            const rows = document.querySelectorAll('#table-charge-2 tbody tr');
            appState.experiments.day2.data.charge = Array.from(rows).map(row => {
                const cells = row.querySelectorAll('td');
                return [cells[0].innerText, cells[1].innerText, cells[2].innerText, cells[3].innerText];
            });
            saveState();
            updateScores('day2');
            if (e.isTrusted) logEditHistory('充電パターンデータを更新', ['day2']);
        });
    }

    // Day 2: Discharge Calc (Multi-Pattern)
    ['A', 'B', 'C'].forEach(p => {
        const tId = `table-discharge-2${p}`;
        const el = document.getElementById(tId);
        if (el) {
            el.addEventListener('input', (e) => {
                const rows = el.querySelectorAll('tbody tr');
                appState.experiments.day2.data[`discharge${p}`] = Array.from(rows).map(row => {
                    const cells = row.querySelectorAll('td');
                    const v = parseFloat(cells[1].innerText) || 0;
                    const i = parseFloat(cells[2].innerText) || 0;
                    const mW = (v * i).toFixed(1);
                    cells[3].textContent = mW;
                    return [parseFloat(cells[0].innerText), v, i, parseFloat(mW)];
                });
                updateChartD2();
                saveState();
                updateScores('day2');
                if (e && e.isTrusted) logEditHistory(`燃料電池放電データ(パターン${p})を更新`, ['day2']);
            });
        }
    });

    // Day 3: Clarity Table
    const tClarity = document.getElementById('table-clarity-3');
    if (tClarity) {
        tClarity.addEventListener('input', (e) => {
            const rows = document.querySelectorAll('#table-clarity-3 tbody tr');
            appState.experiments.day3.data.clarity = Array.from(rows).map(row => parseFloat(row.querySelectorAll('td')[1].innerText) || 0);
            updateChartD3();
            saveState();
            updateScores('day3');
            if (e.isTrusted) logEditHistory('清澄度データを更新', ['day3']);
        });
    }


    // Safety Checks
    ['d1', 'd2', 'd3'].forEach(d => {
        const container = document.getElementById(`${d}-safety-list`);
        if (!container) return;
        const labelsMapping = {
            'd1': ['白衣・メガネ着用', '火災・火傷注意', '整理整頓'],
            'd2': ['KOH保護メガネ', '液漏れ即洗浄', '手洗い・清掃'],
            'd3': ['薬品の取り扱い注意', '装置の接続確認', '整理整頓']
        };
        const labels = labelsMapping[d];
        const dayKey = d === 'd1' ? 'day1' : (d === 'd2' ? 'day2' : 'day3');
        container.innerHTML = labels.map((l, i) => `
            <label class="checkbox-container">
                <input type="checkbox" onchange="toggleSafety('${d}', ${i}, this.checked)" ${appState.experiments[dayKey].safety[i] ? 'checked' : ''}>
                <span class="checkmark"></span> ${l}
            </label>
        `).join('');
    });

    // Discussion / Info Inputs Binding
    const bindIds = [
        'd1-lit-cu', 'd1-lit-al', 'd1-lit-sus',
        'd1-lit-cu-url', 'd1-lit-al-url', 'd1-lit-sus-url',
        'd1-discussion', 'd1-seat', 'd1-date', 'd1-method-text',
        'd2-discussion', 'd2-seat', 'd2-date', 'd2-assembly-method',
        'd3-p1-text', 'd3-p2-text', 'd3-coag-text', 'd3-discussion', 'd3-seat', 'd3-date'
    ];
    bindIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventType = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
            el.addEventListener(eventType, (e) => {
                const day = `day${id.charAt(1)}`;
                if (id.includes('date')) appState.experiments[day].info.date = e.target.value;
                else if (id.includes('seat')) appState.experiments[day].info.seat = e.target.value;
                else if (id.includes('lit')) {
                    const keyPart = id.replace('d1-lit-', '');
                    appState.experiments[day].lit[keyPart] = e.target.value;
                } else if (id.includes('text') && day === 'day3') {
                    appState.experiments[day].data[id.split('-')[1] + '_text'] = e.target.value;
                } else if (id === 'd1-method-text') {
                    appState.experiments.day1.method_text = e.target.value;
                } else {
                    appState.experiments[day][id.split('-')[1]] = e.target.value;
                }

                // Specific update for Discussion/Method Char Count
                if (id.includes('discussion')) updateCounter(`${id}-count`, e.target.value);
                if (id === 'd1-method-text') updateCounter('d1-method-count', e.target.value);
                if (id === 'd2-assembly-method') {
                    appState.experiments.day2.data.assembly_method = e.target.value;
                    updateCounter('d2-method-count', e.target.value);
                }
                if (['d3-p1-text', 'd3-p2-text', 'd3-coag-text'].includes(id)) {
                    updateCounter(`${id}-count`, e.target.value, 100);
                }

                saveState();
                updateScores(day);
                if (e.isTrusted) logEditHistory(`${appState.experiments[day].title} の記述内容を更新`, [day]);
            });
        }
    });

    // Photos
    setupPhoto('dz-1-apparatus', 'day1', 'apparatus');
    setupPhoto('dz-2-electrode', 'day2', 'electrode');
    setupPhoto('dz-2-apparatus', 'day2', 'apparatus');
    setupPhoto('dz-3-target', 'day3', 'target');
    setupPhoto('dz-3-p1-app', 'day3', 'p1_app');
    setupPhoto('dz-3-p1-wat', 'day3', 'p1_wat');
    setupPhoto('dz-3-p2-app', 'day3', 'p2_app');
    setupPhoto('dz-3-p2-wat', 'day3', 'p2_wat');
    setupPhoto('dz-3-coag', 'day3', 'coag');
}

window.generatePDF = function (dayKey) {
    const container = document.querySelector('.pdf-container');
    if (container) {
        container.style.display = 'block';
    }


    const exp = appState.experiments[dayKey];

    // Sync data to the Print Template
    syncPrintTemplate(dayKey);

    // Show only the target day's PDF page
    document.querySelectorAll('.pdf-page').forEach(el => el.style.display = 'none');
    const targetPage = document.getElementById(`pdf-${dayKey}-page`);
    if (targetPage) {
        targetPage.style.display = 'block';
        targetPage.style.width = '794px';
        targetPage.style.margin = '0';
        // Force layout reflow to ensure canvas is ready for rendering
        void targetPage.offsetHeight;
    }

    // Set filename (document title) for PDF output
    const originalTitle = document.title;
    const attendanceId = appState.user.attendanceId || '番号未設定';
    const studentName = appState.user.studentName || '氏名未設定';
    const experimentTitle = exp.title || '実験レポート';
    document.title = `${attendanceId}_${studentName}_${experimentTitle}`;

    // Add history entry for PDF output
    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    addHistoryEntry('pdf', `${exp.title} レポートを出力（作成者: ${appState.user.studentName || '未設定'}, 出力日: ${timestamp}）`, [dayKey]);

    // Show loading info
    showToast("レンダリング中... しばらくお待ちください");

    // Sync data and update PDF charts
    syncPrintTemplate(dayKey);

    // Give Chart.js more time to paint (especially for complex line charts)
    setTimeout(() => {
        window.print();
        // Restore original title after print dialog closes
        setTimeout(() => {
            document.title = originalTitle;
        }, 1000);
    }, 1500);
};

function syncPrintTemplate(day) {
    const exp = appState.experiments[day];
    const n = day.slice(-1);

    const formatDate = (s) => {
        if (!s) return "____年__月__日";
        const d = new Date(s);
        // Check if date is valid before formatting
        if (isNaN(d.getTime())) return s;
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    };

    const setT = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    // Header Metadata
    setT(`pdf-d${n}-date`, formatDate(exp.info.date));
    setT(`pdf-d${n}-class`, appState.user.className || '____');
    setT(`pdf-d${n}-id`, appState.user.attendanceId || '____');
    setT(`pdf-d${n}-name`, appState.user.studentName || '____________');
    setT(`pdf-d${n}-seat`, exp.info.seat || '____');

    // Gen Info
    const nowJST = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    setT(`pdf-d${n}-gen-time`, nowJST);
    setT(`pdf-d${n}-gen-user`, appState.user.studentName || '未設定');

    // Score Summary for PDF Header
    const effort = exp.scores.effort || 0;
    const report = exp.scores.report || 0;
    const totalRate = Math.round(effort + report); // Since max is 50+50=100

    // Colorful HTML string
    const scoreHtml = `
        <span style="color: #333;">取り組み</span> <span style="color: #2563eb; font-size:1.1em;">${effort}</span> <span style="color:#666;">/ 50</span>
        <span style="display:inline-block; width:15px;"></span>
        <span style="color: #333;">レポート</span> <span style="color: #059669; font-size:1.1em;">${report}</span> <span style="color:#666;">/ 50</span>
        <span style="display:inline-block; width:15px;"></span>
        <span style="color: #333;">合計達成度:</span> <span style="color: #dc2626; font-size:1.2em;">${totalRate}%</span>
    `;

    const scoreSummaryEl = document.getElementById(`pdf-d${n}-score-summary`);
    if (scoreSummaryEl) scoreSummaryEl.innerHTML = scoreHtml;

    const sBadge = document.getElementById(`pdf-d${n}-safety`);
    if (sBadge) {
        const allDone = exp.safety.every(s => s);
        sBadge.textContent = allDone ? '済' : '未済';
        sBadge.className = `status-badge ${allDone ? 'done' : ''}`;
    }

    // Common: Tools
    const toolsBody = document.querySelector(`#pdf-d${n}-table-tools tbody`);
    if (toolsBody) {
        toolsBody.innerHTML = exp.tools.length > 0 ? exp.tools.map(t => `<tr><td>${t.name}</td><td>${t.usage}</td></tr>`).join('') : '<tr><td colspan="2" style="text-align:center;">登録なし</td></tr>';
    }

    // Common: Partners
    const labels = ["①", "②", "③"];
    const pContent = (exp.info.partners || []).map((p, i) =>
        `<div class="meta-item" style="display:inline-block; margin-right:10pt;">共同実験者${labels[i]}： ${appState.user.className || '____'} クラス ${p.id || '____'} 番 ${p.name || '____________'}</div>`
    ).join('');

    [`pdf-d${n}-partners`, `pdf-d${n}-partners-list`].forEach(pid => {
        const el = document.getElementById(pid);
        if (el) el.innerHTML = pContent;
    });

    // Common: Homework/Questions
    const hwContainer = document.getElementById(`pdf-d${n}-homework`);
    if (hwContainer) {
        hwContainer.innerHTML = exp.questions.map((q, i) => `
            <div class="academic-question-block" style="margin-bottom: 1.5rem;">
                <div class="question-label" style="font-weight: bold; margin-bottom: 0.5rem; border-left: 3pt solid #333; padding-left: 0.5rem;">問${i + 1} ${q.label}</div>
                <div class="question-answer" style="line-height: 1.6; text-indent: 1em; white-space: pre-wrap;">${q.text || '（未入力）'}</div>
            </div>
        `).join('');
    }

    // Common: Discussion
    const discEl = document.getElementById(`pdf-d${n}-discussion`);
    if (discEl) discEl.textContent = exp.discussion || '(未入力)';

    // Day Specifics
    if (day === 'day1') {
        const ctx = document.getElementById('chart-d1-pdf');
        if (ctx) updateChartD1(true);

        const mBody = document.querySelector('#pdf-d1-table-transfer tbody');
        if (mBody) {
            mBody.innerHTML = exp.data.transfer.map(r => `
                <tr>
                    <td style="text-align:center;">${r[0]}</td>
                    <td style="text-align:center;">${r[1] || ''}</td>
                    <td style="text-align:center;">${r[2] || ''}</td>
                    <td style="text-align:center;">${r[3] || ''}</td>
                </tr>
            `).join('');
        }

        const m = exp.data.melting;
        const valid = [m.m1, m.m2, m.m3].filter(v => parseFloat(v) > 0);
        const avg = valid.length > 0 ? (valid.reduce((a, b) => a + parseFloat(b), 0) / valid.length) : 0;

        setT('pdf-d1-m1', m.m1 || '');
        setT('pdf-d1-m2', m.m2 || '');
        setT('pdf-d1-m3', m.m3 || '');
        setT('pdf-d1-m-avg', avg.toFixed(1));
        setT('pdf-d1-m-avg-text', avg.toFixed(1));

        const methodEl = document.getElementById('pdf-d1-method');
        if (methodEl) methodEl.textContent = exp.method_text || '(未入力)';

        const imgEl = document.getElementById('pdf-d1-img');
        const imgFallback = document.getElementById('pdf-d1-img-fallback');
        if (exp.photos.apparatus) {
            if (imgEl) { imgEl.src = exp.photos.apparatus; imgEl.style.display = 'block'; }
            if (imgFallback) imgFallback.style.display = 'none';
        } else {
            if (imgEl) imgEl.style.display = 'none';
            if (imgFallback) imgFallback.style.display = 'flex';
        }
    }
    else if (day === 'day2') {
        const ctx = document.getElementById('pdf-chart-d2');
        if (ctx) updateChartD2(true);

        const cTbody = document.querySelector('#pdf-d2-table-charge tbody');
        if (cTbody) {
            cTbody.innerHTML = exp.data.charge.map(r => `
                <tr>
                    <td style="text-align:center;">${r[0] || ''}</td>
                    <td style="text-align:center;">${r[1] || ''}</td>
                    <td style="text-align:center;">${r[2] || ''}</td>
                    <td style="text-align:center;">${r[3] || ''}</td>
                </tr>
             `).join('');
        }
        // Multi-pattern discharge tables for PDF
        ['A', 'B', 'C'].forEach(p => {
            const tbody = document.querySelector(`#pdf-d2-table-discharge${p} tbody`);
            if (tbody) {
                const data = exp.data[`discharge${p}`] || [];
                tbody.innerHTML = data.length > 0 ? data.map(r => `
                    <tr>
                        <td style="text-align:center;">${r[0]}</td>
                        <td style="text-align:center;">${r[1] || ''}</td>
                        <td style="text-align:center;">${r[2] || ''}</td>
                        <td style="text-align:center;">${r[3] || ''}</td>
                    </tr>
                `).join('') : '<tr><td colspan="4" style="text-align:center;">記録なし</td></tr>';
            }
        });
        // Day 2 Assembly Method Text in PDF
        const assemblyEl = document.getElementById('pdf-d2-assembly-method');
        if (assemblyEl) assemblyEl.textContent = exp.data.assembly_method || '(未入力)';

        // Photos for Day 2 PDF
        ['electrode', 'apparatus'].forEach(k => {
            const imgEl = document.getElementById(`pdf-d2-img-${k}`);
            const fbEl = document.getElementById(`pdf-d2-img-${k}-fallback`);
            if (exp.photos[k]) {
                if (imgEl) { imgEl.src = exp.photos[k]; imgEl.style.display = 'block'; }
                if (fbEl) fbEl.style.display = 'none';
            } else {
                if (imgEl) imgEl.style.display = 'none';
                if (fbEl) fbEl.style.display = 'flex';
            }
        });
    }
    else if (day === 'day3') {
        const ctx = document.getElementById('pdf-chart-d3');
        if (ctx) updateChartD3(true);

        const keys = ['p1_text', 'p2_text', 'coag_text'];
        keys.forEach(k => {
            const el = document.getElementById(`pdf-d3-${k.replace('_', '-')}`);
            if (el) el.textContent = exp.data[k] || '';
        });

        const clarifyTbody = document.querySelector('#pdf-d3-table-clarity tbody');
        if (clarifyTbody) {
            const labels = ['処理前', 'プロトタイプ1', 'プロトタイプ2'];
            clarifyTbody.innerHTML = exp.data.clarity.map((v, i) => `
                <tr><td style="text-align:center;">${labels[i]}</td><td style="text-align:center;">${v || 0}</td></tr>
            `).join('');
        }

        // Render Day 3 Photos in PDF
        // Render Day 3 Photos in PDF
        const photoKeys = ['target', 'p1_app', 'p1_wat', 'p2_app', 'p2_wat', 'coag'];
        photoKeys.forEach(k => {
            const imgEl = document.getElementById(`pdf-d3-img-${k.replace('_', '-')}`);
            const fbEl = document.getElementById(`pdf-d3-img-${k.replace('_', '-')}-fallback`);
            if (exp.photos[k]) {
                if (imgEl) {
                    imgEl.src = exp.photos[k];
                    imgEl.style.display = 'block';
                }
                if (fbEl) fbEl.style.display = 'none';
            } else {
                if (imgEl) imgEl.style.display = 'none';
                if (fbEl) fbEl.style.display = 'flex';
            }
        });
    }

    // Common: References (New generic handler for all days)
    const refsContainer = document.getElementById(`pdf-d${n}-refs`);
    if (refsContainer) {
        if (exp.refs && exp.refs.length > 0) {
            refsContainer.innerHTML = '<div class="table-label" style="text-align:left; margin-bottom:5pt;">参考文献一覧</div>' +
                '<ul style="list-style:none; padding-left:0; margin-bottom: 1rem;">' +
                exp.refs.map((r, i) =>
                    `<li style="margin-bottom:4pt; font-size:9pt; text-indent: -1.5em; padding-left: 1.5em;">[${i + 1}] ${r.author ? r.author + ' ' : ''}『${r.title}』${r.source ? ' ' + r.source : ''}</li>`
                ).join('') + '</ul>';
        } else {
            refsContainer.innerHTML = '<div style="color:#999; font-size:9pt; margin-bottom: 1rem;">参考文献：登録なし</div>';
        }
    }


    // Render History in PDF
    const historyContainer = document.getElementById(`pdf-d${n}-history`);
    if (historyContainer) {
        const hItems = appState.history || [];
        const typeLabels = { 'edit': '編集', 'import': '読込', 'pdf': '出力', 'init': '作成', 'share': '共有', 'backup': '保存' };

        // Filter History Items by Day
        const filteredItems = hItems.filter(h => {
            // 1. Check Tags first (New Data)
            if (h.tags && Array.isArray(h.tags) && h.tags.length > 0) {
                return h.tags.includes(day) || h.tags.includes('all');
            }

            // 2. Legacy fallback (Content Matching)
            const txt = h.details || '';
            const t = h.type;

            // Always include global actions
            if (t === 'backup' || t === 'init') return true;
            if (txt.includes('基本情報') || txt.includes('システム')) return true;

            // Check for mismatched experiment titles/keywords to exclude
            const keywords = {
                'day1': ['熱の可視化', 'パラフィン', '融解', '伝熱', '熱伝導', '実験1'],
                'day2': ['燃料電池', '充電', '放電', 'アルカリ', '電極', '実験2'],
                'day3': ['水処理', '清澄', '凝集', 'ろ過', 'プロトタイプ', '実験3']
            };

            // If the text contains keywords from OTHER days, exclude it
            const otherDays = Object.keys(keywords).filter(d => d !== day);
            for (const od of otherDays) {
                if (keywords[od].some(k => txt.includes(k))) return false;
            }

            // If it matches CURRENT day keywords, include it
            if (keywords[day].some(k => txt.includes(k))) return true;

            // If ambiguous (no day info matched), include it to be safe (or exclude? - User said "divide", so maybe safe to include common)
            // Let's assume common edits for all unless clearly another day
            return true;
        });

        // Limit to reasonable number for PDF?? User said "All history" in previous turn.
        // But "Filter by theme" in this turn.
        // So we show all *filtered* items.

        historyContainer.innerHTML = filteredItems.map(h => {
            const d = new Date(h.timestamp);
            const timeStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
            return `
                <div style="font-size: 8pt; margin-bottom: 2pt; border-bottom: 0.1pt solid #eee; padding-bottom: 2pt;">
                    [${typeLabels[h.type] || '記録'}] ${timeStr} - ${h.user}: ${h.details}
                </div>
            `;
        }).join('');
    }
}

window.exportJSON = async function () {
    saveState();

    const backupObj = JSON.parse(JSON.stringify(appState));
    backupObj.backupMeta = {
        creator: appState.user.studentName || '未設定',
        exportedAt: new Date().toLocaleString()
    };

    const envelope = await CryptoUtils.encrypt(JSON.stringify(backupObj), null);
    const hexFileContent = CryptoUtils.sToH(JSON.stringify(envelope));
    const blob = new Blob([hexFileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    a.download = `ReportBackup_${dateStr}.dat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addHistoryEntry('backup', `完全バックアップを保存`, ['all']);
};

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 3000);
}

function setupPhoto(id, day, key) {
    const dz = document.getElementById(id);
    if (!dz) return;
    dz.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                resizeImage(file, 1024, 1024, (resizedDataUrl) => {
                    appState.experiments[day].photos[key] = resizedDataUrl;
                    renderPhoto(dz, day, key);
                    saveState();
                    updateScores(day);
                    logEditHistory(`${appState.experiments[day].title} の写真を追加`, [day]);
                });
            }
        };
        input.click();
    });
}

function resizeImage(file, maxWidth, maxHeight, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7)); // Compress to 0.7 quality
        };
    };
}

function renderPhoto(el, day, key) {
    const photo = appState.experiments[day].photos[key];
    if (photo) {
        el.innerHTML = `
            <div class="photo-container" style="background:#000; display:flex; align-items:center; justify-content:center;">
                <img src="${photo}" style="width:100%; height:100%; object-fit:contain; border-radius:10px;">
                <button class="btn-photo-delete" title="写真を削除" 
                    onclick="event.stopPropagation(); window.removePhoto('${day}', '${key}', '${el.id}')">✖</button>
            </div>
        `;
    } else {
        const labels = {
            'apparatus': '📷 装置写真を記録',
            'electrode': '📷 組み立てた電極',
            'target': '📷 浄化前の水（原水）',
            'p1_app': '📷 試作①装置',
            'p1_wat': '📷 試作①浄化水',
            'p2_app': '📷 試作②装置',
            'p2_wat': '📷 試作②浄化水',
            'coag': '📷 凝集処理後'
        };
        el.innerHTML = `<p>${labels[key] || '📷 写真を記録'}</p>`;
    }
}

window.removePhoto = (day, key, dzId) => {
    if (!confirm("写真を削除してもよろしいですか？")) return;
    appState.experiments[day].photos[key] = null;
    const dz = document.getElementById(dzId);
    if (dz) renderPhoto(dz, day, key);
    saveState();
    updateScores(day);
    logEditHistory(`${appState.experiments[day].title} の写真を削除`);
};

function switchView(vid) {
    appState.activeView = vid;
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    const view = document.getElementById(`${vid}-view`);
    if (view) view.classList.add('active');
    const menu = document.querySelector(`[data-view="${vid}"]`);
    if (menu) menu.classList.add('active');

    if (menu) {
        document.getElementById('view-title').textContent = menu.querySelector('.label').textContent;
    }

    if (vid === 'day1') updateChartD1();
    if (vid === 'day2') updateChartD2();
    if (vid === 'day3') updateChartD3();
    if (vid === 'rubric' && typeof updateRubricStars === 'function') updateRubricStars();
}

function updateScores(day) {
    const exp = appState.experiments[day];
    const n = day.slice(-1);

    let maxEffort = 50;
    let maxReport = 50;

    if (day === 'day1') {
        // --- DAY 1 RUBRIC (Effort 50 / Report 50) ---
        maxEffort = 50;
        maxReport = 50;

        // Effort (50)
        let effort = 0;
        // 1. Basic Info (5)
        if (appState.user.studentName && exp.info.seat) effort += 5;
        // 2. Safety (10)
        if (exp.safety.every(s => s)) effort += 10;
        // 3. Tools (5)
        if (exp.tools.length > 0) effort += Math.min(exp.tools.length, 5);
        // 4. Photo (10)
        if (exp.photos.apparatus) effort += 10;
        // 5. Data Entry (10) - Melting & Lit
        const hasMelting = exp.data.melting.m1 && exp.data.melting.m2;
        const hasLit = exp.lit.cu;
        if (hasMelting && hasLit) effort += 10;
        // 6. Refs (Max 10) - Proportional to count
        if (exp.refs && exp.refs.length > 0) {
            effort += Math.min(exp.refs.length * 2, 10); // 2 points per ref, max 10
        }

        exp.scores.effort = Math.min(effort, maxEffort);

        // Report (50)
        let reportDetails = 0;

        // 1. Method (5) - Proportional to length
        const mText = exp.method_text || '';
        reportDetails += Math.min(mText.length / 200, 1.0) * 5;

        // 2. Discussion (9) - Proportional to length
        const dText = exp.discussion || '';
        reportDetails += Math.min(dText.length / 200, 1.0) * 9;

        // 3. Questions (36pts = 12 * 3)
        // Split: 6pts for Length (Proportional), 6pts for Keywords (Binary)
        exp.questions.forEach(q => {
            const qText = q.text || '';
            const kwCheck = q.keywords.every(kw => qText.includes(kw));

            const lenScore = Math.min(qText.length / 200, 1.0) * 6;
            const kwScore = kwCheck ? 6 : 0;

            reportDetails += lenScore + kwScore;
        });

        exp.scores.report = Math.min(Math.round(reportDetails), maxReport);

    } else if (day === 'day2') {
        // --- DAY 2 RUBRIC (Strict) ---
        let effort = 0;
        if (appState.user.studentName) effort += 5;
        if (exp.info.seat) effort += 5;
        if (exp.safety.every(s => s)) effort += 10;
        if (exp.tools.length > 0) effort += 10;
        if (Object.values(exp.photos).some(p => p !== null)) effort += 20;
        exp.scores.effort = Math.min(effort, maxEffort);

        // Report (50)
        let report = 0;

        // 1. Assembly Method (15 pts) - Strict
        const amTxt = exp.data.assembly_method || '';
        if (amTxt.length >= 100) report += 15;
        else if (amTxt.length >= 50) report += 10;
        else if (amTxt.length >= 20) report += 5;

        // 2. Discussion (15 pts) - Strict: >=200 chars (15pts), >=100 (10pts), >=50 (5pts)
        if (exp.discussion) {
            if (exp.discussion.length >= 200) report += 15;
            else if (exp.discussion.length >= 100) report += 10;
            else if (exp.discussion.length >= 50) report += 5;
        }

        // 3. Questions (15 pts: 3 questions * 5)
        exp.questions.forEach(q => {
            if (q.text.length >= q.minChar && q.keywords.every(kw => q.text.includes(kw))) report += 5;
            else if (q.text.length > 50) report += 2;
        });

        // 4. References (5 pts)
        if (exp.refs && exp.refs.length > 0) {
            report += Math.min(exp.refs.length, 5);
        }

        exp.scores.report = Math.min(Math.round(report), 50);

    } else if (day === 'day3') {
        // --- DAY 3 RUBRIC ---
        // Effort (50)
        let effort = 0;
        if (appState.user.studentName) effort += 5;
        if (exp.info.seat) effort += 5;
        if (exp.safety.every(s => s)) effort += 10;
        if (exp.tools.length > 0) effort += 10;
        // Photos (Multiple) - 20 pts
        const photoCount = Object.values(exp.photos).filter(p => p !== null).length;
        effort += Math.min(photoCount * 4, 20);
        exp.scores.effort = Math.min(effort, maxEffort);

        // Report (50)
        let report = 0;

        // 1. Observation/Method Texts (15 pts) - Strict: >=100 chars (5pts), >=50 chars (2pts)
        const d = exp.data;
        const scoreText = (txt) => {
            if (!txt) return 0;
            if (txt.length >= 100) return 5;
            if (txt.length >= 50) return 2;
            return 0;
        };
        report += scoreText(d.p1_text);
        report += scoreText(d.p2_text);
        report += scoreText(d.coag_text);

        // 2. Discussion (15 pts) - Strict: >=200 chars (15pts), >=100 (10pts), >=50 (5pts)
        if (exp.discussion) {
            if (exp.discussion.length >= 200) report += 15;
            else if (exp.discussion.length >= 100) report += 10;
            else if (exp.discussion.length >= 50) report += 5;
        }

        // 3. Questions (15 pts: 3 questions * 5)
        exp.questions.forEach(q => {
            if (q.text.length >= q.minChar && q.keywords.every(kw => q.text.includes(kw))) report += 5;
            else if (q.text.length > 50) report += 2;
        });

        // 4. References (5 pts)
        if (exp.refs && exp.refs.length > 0) {
            report += Math.min(exp.refs.length, 5);
        }

        exp.scores.report = Math.min(Math.round(report), 50);
    }

    const total = exp.scores.effort + exp.scores.report;

    // Update UI
    const badge = document.getElementById(`badge-${day}`);
    if (badge) badge.textContent = `${total}%`;

    const eScore = document.getElementById(`d${n}-score-effort`);
    if (eScore) eScore.textContent = `${exp.scores.effort} / ${maxEffort}`;

    const rScore = document.getElementById(`d${n}-score-report`);
    if (rScore) rScore.textContent = `${exp.scores.report} / ${maxReport}`;

    const eBar = document.getElementById(`d${n}-eval-effort`);
    if (eBar) eBar.style.width = `${(exp.scores.effort / maxEffort) * 100}%`;

    const rBar = document.getElementById(`d${n}-eval-report`);
    if (rBar) rBar.style.width = `${(exp.scores.report / maxReport) * 100}%`;

    const tRate = document.getElementById(`d${n}-total-rate`);
    if (tRate) tRate.textContent = `${total}%`;

    updateGlobalProgress();
}

function updateGlobalProgress() {
    const scores = ['day1', 'day2', 'day3'].map(day => {
        const s = appState.experiments[day].scores.effort + appState.experiments[day].scores.report;
        const elRing = document.getElementById(`ring-${day}`);
        const elText = document.getElementById(`rate-${day}`);
        if (elRing) elRing.style.strokeDashoffset = 157 - (157 * s / 100);
        if (elText) elText.textContent = `${s}%`;
        return s;
    });

    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / 3);
    const gRate = document.getElementById('global-achievement-rate');
    if (gRate) gRate.textContent = `${avg}%`;
    const gRing = document.getElementById('global-progress-ring');
    if (gRing) gRing.style.strokeDashoffset = 314 - (314 * avg / 100);
}

// --- Dynamic Renders ---
function renderAllQuestions() {
    [1, 2, 3].forEach(n => {
        const container = document.getElementById(`questions-d${n}`);
        if (!container) return;

        container.innerHTML = `
            <div class="table-wrapper">
                <table class="question-table">
                    <thead>
                        <tr>
                            <th width="30%">課題・キーワード</th>
                            <th>回答（指定語句を含めて記述）</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${appState.experiments[`day${n}`].questions.map((q, i) => {
            const currentText = q.text || '';
            const charCount = currentText.length;
            const isMinMet = charCount >= q.minChar;
            const kwItems = q.keywords.map(kw =>
                `<span class="keyword-status ${currentText.includes(kw) ? 'found' : 'missing'}">${kw}</span>`
            ).join(' ');

            return `
                                <tr>
                                    <td>
                                        <div class="q-label-box">
                                            <strong>${q.label}</strong>
                                            <div class="q-kw-box">${kwItems}</div>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="q-text-container">
                                            <textarea class="glass-input q-textarea" 
                                                oninput="updateQ(${n}, ${i}, this.value)"
                                                placeholder="${q.minChar}文字以上で記述してください...">${q.text}</textarea>
                                            <div class="q-footer-row">
                                                <span class="char-count ${isMinMet ? 'valid' : ''}">${charCount} / ${q.minChar}文字</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
}

window.updateQ = (dayN, qIdx, val) => {
    appState.experiments[`day${dayN}`].questions[qIdx].text = val;

    // Update local UI only (prevent re-render focus loss)
    const q = appState.experiments[`day${dayN}`].questions[qIdx];
    const container = document.getElementById(`questions-d${dayN}`);
    if (container) {
        const rows = container.querySelectorAll('tbody tr');
        if (rows[qIdx]) {
            const item = rows[qIdx];
            // Update Char Count
            const countEl = item.querySelector('.char-count');
            if (countEl) {
                countEl.textContent = `${val.length} / ${q.minChar}文字`;
                if (val.length >= q.minChar) countEl.classList.add('valid');
                else countEl.classList.remove('valid');
            }

            // Update Keywords
            const kwContainer = item.querySelector('.q-kw-box');
            if (kwContainer) {
                kwContainer.innerHTML = q.keywords.map(kw =>
                    `<span class="keyword-status ${val.includes(kw) ? 'found' : 'missing'}">${kw}</span>`
                ).join(' ');
            }
        }
    }

    saveState();
    updateScores(`day${dayN}`);
    logEditHistory(`実験${dayN} の課題回答を更新`, [`day${dayN}`]);
};

window.addPartner = function (day) {
    const exp = appState.experiments[day];
    if (!exp.info) exp.info = { partners: [], seat: '' };
    if (!exp.info.partners) exp.info.partners = [];

    if (exp.info.partners.length >= 3) {
        alert('共同実験者は最大3名までです。');
        return;
    }

    exp.info.partners.push({ id: '', name: '', seat: '' });
    renderPartners(day);
    saveState();
};

// --- Group Data Sharing (Secure HEX V6) ---
const CryptoUtils = {
    DEFAULT_PASS: "antigravity-secure-scramble-2026",

    async deriveKey(password, salt) {
        if (!window.crypto?.subtle) throw new Error("CRYPTO_API_NOT_FOUND");
        const enc = new TextEncoder();
        const pwd = password || this.DEFAULT_PASS;
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", enc.encode(pwd), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
    },
    async encrypt(text, password) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(text)
        );
        return {
            v: 6, // V6 logic
            payload: this.buf2hex(encrypted),
            iv: this.buf2hex(iv),
            salt: this.buf2hex(salt),
            isProtected: false // Passwords abolished
        };
    },
    async decrypt(obj, password) {
        const salt = this.hex2buf(obj.salt);
        const iv = this.hex2buf(obj.iv);
        const data = this.hex2buf(obj.payload);
        const key = await this.deriveKey(password || this.DEFAULT_PASS, salt);
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, key, data
        );
        return new TextDecoder().decode(decrypted);
    },
    buf2hex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },
    hex2buf(hex) {
        const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
        const bytes = new Uint8Array(cleaned.length / 2);
        for (let i = 0; i < cleaned.length; i += 2) {
            bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
        }
        return bytes;
    },
    // String content to Hex for the file shell
    sToH(s) {
        return Array.from(new TextEncoder().encode(s))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    },
    // Hex shell back to string content
    hToS(h) {
        const cleaned = h.replace(/[^0-9a-fA-F]/g, '');
        const b = new Uint8Array(cleaned.length / 2);
        for (let i = 0; i < cleaned.length; i += 2) {
            b[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
        }
        return new TextDecoder().decode(b);
    }
};

window.exportGroupDataJSON = async () => {
    if (!window.crypto?.subtle) {
        alert("ブラウザのセキュリティ制限により機能が利用できません（HTTPS等が必要）。");
        return;
    }

    const day = appState.activeView;
    if (!['day1', 'day2', 'day3'].includes(day)) {
        alert('実験ページ（Day 1~3）を開いた状態で書き出してください。');
        return;
    }

    const exp = appState.experiments[day];
    const shareObj = {
        title: exp.title,
        day: day,
        meta: {
            exporter: appState.user.studentName || '未設定',
            exportedAt: new Date().toLocaleString(),
            partners: exp.info.partners
        },
        content: {
            tools: exp.tools,
            data: exp.data,
            lit: exp.lit || {},
            photos: exp.photos
        }
    };

    try {
        const envelope = await CryptoUtils.encrypt(JSON.stringify(shareObj), null);
        const hexFileContent = CryptoUtils.sToH(JSON.stringify(envelope));

        const blob = new Blob([hexFileContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GroupShare_${day}_${new Date().toISOString().slice(0, 10)}.dat`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addHistoryEntry('share', `【${exp.title}】データを共有用に書き出し`);
    } catch (e) {
        console.error("Export Error:", e);
        alert("書き出しに失敗しました。");
    }
};

window.importDataHandler = (inputElement, mode) => {
    const input = inputElement;
    if (!input?.files?.[0]) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        let step = "INIT";
        try {
            step = "READ_CONTENT";
            const rawContent = e.target.result.trim();
            if (!rawContent) throw new Error("EMPTY_FILE");

            step = "HEX_DECODE_OUTER";
            const envelopeStr = CryptoUtils.hToS(rawContent);

            step = "PARSE_ENVELOPE";
            const envelope = JSON.parse(envelopeStr);

            if (envelope.v !== 6) {
                alert("エラー: 形式が異なるか、古いバージョンのファイルです。新しく出力し直した.datファイルを使用してください。");
                input.value = ''; return;
            }

            step = "AUTH_OR_DECRYPT";
            let decryptedStr = "";
            if (envelope.isProtected) {
                const password = prompt("このデータ形式はパスワード保護されています。入力してください:");
                if (password === null) { input.value = ''; return; }
                decryptedStr = await CryptoUtils.decrypt(envelope, password);
            } else {
                decryptedStr = await CryptoUtils.decrypt(envelope, null);
            }

            step = "PARSE_INNER_DATA";
            const imported = JSON.parse(decryptedStr);

            const isFullBackup = !!(imported.experiments && imported.user);

            // Validation: Ensure mode matches content
            if (mode === 'group' && isFullBackup) {
                alert("これは【全保存バックアップ】ファイルです。復元するには「全読込」ボタンを使用してください。");
                input.value = ''; return;
            }
            if (mode === 'full' && !isFullBackup) {
                alert("これは【班員共有】データです。読み込むには「実験データの読込」ボタンを使用してください。");
                input.value = ''; return;
            }

            // CASE 1: Full Backup Restoration
            if (isFullBackup) {
                const meta = imported.backupMeta || { creator: '未設定', exportedAt: '不明' };
                const currentUserName = (appState.user.studentName || '').trim();
                const backupCreatorName = (meta.creator || '').trim();

                // Validation: Creator must be set AND match the current user
                // EXCEPTION: User "平林" can restore ANY data (Super Admin)
                const isSuperAdmin = currentUserName.includes('平林');

                if (backupCreatorName === '' || backupCreatorName === '未設定') {
                    alert("エラー：このバックアップファイルには有効な作成者情報が含まれていません。読み込みを中止します。");
                    input.value = ''; return;
                }

                if (!isSuperAdmin && backupCreatorName !== currentUserName) {
                    alert("このファイルは復元できません。\n復元データを用いて作成する場合は、初回作成時、ダッシュボードの基本情報に入れた氏名を正確に設定してください。");
                    input.value = ''; return;
                }

                if (!confirm(`【全データ復元】\n本人確認が完了しました（作成日: ${meta.exportedAt}）\n\nこのバックアップで現在の状態を完全に上書きしますか？`)) {
                    input.value = ''; return;
                }
                appState = imported;

                // Add restoration record to history
                addHistoryEntry('import', `バックアップ (${meta.exportedAt}) から状態を完全に復元`);

                // Immediate Sync (Avoid reload to keep memory state safe if LocalStorage quota hit)
                saveState();
                updateUIFromState();
                syncSideProfile();
                renderHistory();
                switchView('dashboard');

                alert(`【復元完了】\n作成者: ${meta.creator} さんの全データを復元しました。\n\n※写真サイズが大きい場合、保存(LocalStorage)に失敗している可能性があります。定期的に「全保存」(.dat)を行ってデータを保護してください。`);
                return;
            }

            // CASE 2: Group Data Share (Legacy/Standard)
            const currentView = appState.activeView;

            if (imported.day !== currentView) {
                if (!confirm(`現在開いている実験 (${currentView}) とデータの実験 (${imported.day}) が異なります。続行しますか？`)) {
                    input.value = ''; return;
                }
            }

            const exp = appState.experiments[imported.day];
            if (!confirm(`【${imported.title}】を読み込みます。\n出力者: ${imported.meta.exporter}\n\n⚠️ 実験器具・データが上書きされます。よろしいですか？`)) {
                input.value = ''; return;
            }

            // Sync
            if (imported.content.tools) exp.tools = imported.content.tools;
            if (imported.content.data) exp.data = imported.content.data;
            if (imported.content.lit && imported.day === 'day1') exp.lit = imported.content.lit;
            if (imported.content.photos) exp.photos = imported.content.photos;

            saveState();
            updateUIFromState();
            updateScores(imported.day);
            if (currentView !== imported.day) switchView(imported.day);

            const photoMsg = imported.content.photos ? '（写真含む）' : '';
            addHistoryEntry('import', `${imported.meta.exporter} さんから【${imported.title}】データ${photoMsg}を取り込み`);
            alert(`データの反映が完了しました。`);
            input.value = '';

        } catch (err) {
            console.error("Import Error at step " + step + ":", err);
            alert(`エラー: データの読み込みに失敗しました。\n[Step: ${step}]\n[Detail: ${err.message || 'Unknown'}]`);
            input.value = '';
        }
    };
    reader.readAsText(input.files[0]);
};

function renderPartners(day) {
    const n = day.slice(-1);
    const container = document.getElementById(`d${n}-partners-list-academic`) || document.getElementById(`d${n}-partners-list`);
    if (!container) return;

    const partners = appState.experiments[day].info.partners || [];
    const labels = ["①", "②", "③"];
    const currentClass = appState.user.className || '____';

    container.innerHTML = partners.map((p, i) => `
        <div class="member-row academic-partner-row" style="margin-bottom: 0.75rem;">
            <!-- Print-only text -->
            <div class="only-print academic-text-print" style="margin-bottom: 0.5rem; font-size: 11pt;">
                共同実験者${labels[i]}： ${currentClass} クラス ${p.id || '____'} 番 ${p.name || '____________'}
            </div>
            
            <!-- Editor (Hidden during print) -->
            <div class="no-print">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.4rem;">共同実験者 ${labels[i]} (クラスは自動固定)</div>
                <div class="input-group-row">
                    <select class="glass-input small partner-id-select" style="width: 70px;" onchange="window.uPartner('${day}',${i},'id',this.value)" data-val="${p.id}"></select>
                    <input type="text" class="glass-input" placeholder="氏名" value="${p.name || ''}" oninput="window.uPartner('${day}',${i},'name',this.value)">
                    <button class="btn-remove" onclick="window.rPartner('${day}',${i})" title="削除">✖</button>
                </div>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.partner-id-select').forEach(sel => {
        populateAttendanceOptions(sel);
        sel.value = sel.dataset.val;
    });
}

window.uPartner = (d, i, f, v) => {
    try {
        if (appState.experiments[d].info.partners[i]) {
            appState.experiments[d].info.partners[i][f] = v;
            saveState();
            updateScores(d);
        }
    } catch (e) { console.error("uPartner error:", e); }
};

window.rPartner = (d, i) => {
    try {
        appState.experiments[d].info.partners.splice(i, 1);
        renderPartners(d);
        saveState();
        updateScores(d);
    } catch (e) { console.error("rPartner error:", e); }
};

window.addTool = function (day) {
    appState.experiments[day].tools.push({ name: '', usage: '' });
    renderTools(day);
    saveState();
};
function renderTools(day) {
    const n = day.slice(-1);
    const container = document.querySelector(`#table-tools-${n} tbody`);
    if (container) {
        container.innerHTML = appState.experiments[day].tools.map((t, i) => `
            <tr><td contenteditable oninput="uTool('${day}',${i},'name',this.innerText)">${t.name}</td><td contenteditable oninput="uTool('${day}',${i},'usage',this.innerText)">${t.usage}</td><td><button onclick="rTool('${day}',${i})">✖</button></td></tr>
        `).join('');
    }
}
window.uTool = (d, i, f, v) => { appState.experiments[d].tools[i][f] = v; saveState(); };
window.rTool = (d, i) => { appState.experiments[d].tools.splice(i, 1); renderTools(d); saveState(); };

window.addRef = function (day) {
    appState.experiments[day].refs.push({ title: '', author: '', source: '' });
    renderRefs(day);
    saveState();
};
function renderRefs(day) {
    const n = day.slice(-1);
    const container = document.querySelector(`#table-refs-${n} tbody`);
    if (container) {
        container.innerHTML = appState.experiments[day].refs.map((r, i) => `
            <tr>
                <td contenteditable oninput="uRef('${day}',${i},'title',this.innerText)">${r.title || ''}</td>
                <td contenteditable oninput="uRef('${day}',${i},'author',this.innerText)">${r.author || ''}</td>
                <td contenteditable oninput="uRef('${day}',${i},'source',this.innerText)">${r.source || ''}</td>
                <td style="text-align:center;"><button class="btn-remove" onclick="rRef('${day}',${i})">✖</button></td>
            </tr>
        `).join('');
    }
}
window.uRef = (d, i, f, v) => { appState.experiments[d].refs[i][f] = v; saveState(); };
window.rRef = (d, i) => { appState.experiments[d].refs.splice(i, 1); renderRefs(d); saveState(); };

window.toggleSafety = (d, i, v) => {
    const dayKey = d === 'd1' ? 'day1' : (d === 'd2' ? 'day2' : 'day3');
    appState.experiments[dayKey].safety[i] = v;
    const statusEl = document.getElementById(`${d}-safety-status`);
    if (statusEl) {
        const allDone = appState.experiments[dayKey].safety.every(s => s);
        statusEl.textContent = allDone ? '済' : '未済';
        statusEl.className = `academic-badge ${allDone ? 'done' : ''}`;
    }
    saveState();
    updateScores(dayKey);
};

// --- Charts ---
const chartAreaBorder = {
    id: 'chartAreaBorder',
    beforeDraw(chart, args, options) {
        const { ctx, chartArea: { left, top, width, height } } = chart;
        ctx.save();
        ctx.strokeStyle = options.borderColor || '#333';
        ctx.lineWidth = options.borderWidth || 1;
        ctx.setLineDash(options.borderDash || []);
        ctx.lineDashOffset = options.borderDashOffset || 0;
        ctx.strokeRect(left, top, width, height);
        ctx.restore();
    }
};

function updateChartD1(forPdf = false) {
    const canvasId = forPdf ? 'chart-d1-pdf' : 'chart-d1';
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const d = appState.experiments.day1.data.transfer;

    if (forPdf) {
        if (charts.d1Pdf) charts.d1Pdf.destroy();
    } else {
        if (charts.d1) charts.d1.destroy();
    }

    const config = {
        type: 'line',
        data: {
            labels: d.map(r => r[0]),
            datasets: [
                { label: '銅パイプ', data: d.map(r => r[1]), borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgb(255, 99, 132)', tension: 0.1 },
                { label: 'アルミニウムパイプ', data: d.map(r => r[2]), borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgb(54, 162, 235)', tension: 0.1 },
                { label: 'ステンレスパイプ(SUS304)', data: d.map(r => r[3]), borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgb(75, 192, 192)', tension: 0.1 }
            ]
        },
        plugins: [chartAreaBorder],
        options: {
            plugins: {
                chartAreaBorder: {
                    borderColor: '#333',
                    borderWidth: 1
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            animation: forPdf ? false : {},
            scales: {
                y: { title: { display: true, text: '融解時間 (sec)' } },
                x: { title: { display: true, text: '加熱端からの距離 (cm)' } }
            }
        }
    };

    if (forPdf) {
        charts.d1Pdf = new Chart(ctx, config);
    } else {
        charts.d1 = new Chart(ctx, config);
    }
}
function updateChartD2(forPdf = false) {
    const canvasId = forPdf ? 'pdf-chart-d2' : 'chart-d2';
    const ctx = document.getElementById(canvasId); if (!ctx) return;

    const dataA = (appState.experiments.day2.data.dischargeA || []).filter(r => !isNaN(r[0]) && !isNaN(r[3]));
    const dataB = (appState.experiments.day2.data.dischargeB || []).filter(r => !isNaN(r[0]) && !isNaN(r[3]));
    const dataC = (appState.experiments.day2.data.dischargeC || []).filter(r => !isNaN(r[0]) && !isNaN(r[3]));

    const calculateCapacity = (data) => {
        if (data.length < 2) return 0;
        let area = 0;
        for (let i = 0; i < data.length - 1; i++) {
            const t1 = Number(data[i][0]);
            const t2 = Number(data[i + 1][0]);
            const p1 = Number(data[i][3]);
            const p2 = Number(data[i + 1][3]);
            area += ((p1 + p2) / 2) * (t2 - t1);
        }
        return area / 60;
    };

    const capacityA = calculateCapacity(dataA);
    const capacityB = calculateCapacity(dataB);
    const capacityC = calculateCapacity(dataC);

    // Robust cleanup using Chart.js API
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    const config = {
        type: 'line',
        data: {
            datasets: [
                {
                    label: `パターンA (${capacityA.toFixed(2)} mWh)`,
                    data: dataA.map(r => ({ x: Number(r[0]), y: Number(r[3]) })),
                    borderColor: '#8b5cf6',
                    backgroundColor: '#8b5cf6',
                    tension: 0.1,
                    fill: false
                },
                {
                    label: `パターンB (${capacityB.toFixed(2)} mWh)`,
                    data: dataB.map(r => ({ x: Number(r[0]), y: Number(r[3]) })),
                    borderColor: '#ec4899',
                    backgroundColor: '#ec4899',
                    tension: 0.1,
                    fill: false
                },
                {
                    label: `パターンC (${capacityC.toFixed(2)} mWh)`,
                    data: dataC.map(r => ({ x: Number(r[0]), y: Number(r[3]) })),
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    tension: 0.1,
                    fill: false
                }
            ]
        },
        plugins: [chartAreaBorder],
        options: {
            plugins: {
                chartAreaBorder: {
                    borderColor: '#333',
                    borderWidth: 1
                },
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const capacities = [capacityA, capacityB, capacityC];
                            return `電池容量: ${capacities[context.datasetIndex].toFixed(2)} mWh`;
                        }
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            animation: forPdf ? false : {},
            scales: {
                y: { title: { display: true, text: '出力 (mW)' }, beginAtZero: true },
                x: {
                    type: 'linear',
                    title: { display: true, text: '時間 (min)' },
                    ticks: { precision: 0 }
                }
            }
        }
    };

    const newChart = new Chart(ctx, config);
    if (forPdf) charts.d2Pdf = newChart;
    else charts.d2 = newChart;
}
function updateChartD3(forPdf = false) {
    const canvasId = forPdf ? 'pdf-chart-d3' : 'chart-d3';
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    const d = appState.experiments.day3.data.clarity;

    if (!forPdf && charts.d3) charts.d3.destroy();
    if (forPdf && charts.d3Pdf) charts.d3Pdf.destroy();

    // Custom Plugin for Bar Labels
    const purityLabelPlugin = {
        id: 'purityLabel',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                meta.data.forEach((bar, index) => {
                    const value = dataset.data[index];
                    if (value != null) {
                        const percentage = (value / 10).toFixed(1) + '%';
                        ctx.fillStyle = '#333';
                        ctx.font = 'bold 10pt "Helvetica Neue", "Helvetica", "Arial", sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(percentage, bar.x, bar.y - 5);
                    }
                });
            });
            ctx.restore();
        }
    };

    const config = {
        type: 'bar',
        data: {
            labels: ['浄化前', '試作①', '試作②'],
            datasets: [{
                label: '清澄度',
                data: d,
                backgroundColor: ['#94a3b8', '#3b82f6', '#10b981'],
                maxBarThickness: 60
            }]
        },
        plugins: [purityLabelPlugin, chartAreaBorder],
        options: {
            plugins: {
                chartAreaBorder: {
                    borderColor: '#333',
                    borderWidth: 1
                },
                legend: { display: false }
            },
            responsive: true,
            scales: {
                y: {
                    title: {
                        display: true,
                        text: '清澄度 [－] (水道水を1000)'
                    },
                    suggestedMax: 1000,
                    beginAtZero: true
                }
            }
        }
    };

    if (forPdf) {
        charts.d3Pdf = new Chart(ctx, config);
    } else {
        charts.d3 = new Chart(ctx, config);
    }
}

// --- Persistence ---
let appState = JSON.parse(JSON.stringify(defaultAppState));

function saveState() {
    try {
        localStorage.setItem('digitalLab_V2', JSON.stringify(appState));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.error("Storage Quota Exceeded:", e);
            // Non-blocking warning (show only once or throttle)
            showToast("⚠️ 容量制限により一部のデータ（大型の写真など）が保存できません。");
        }
    }
}

function loadState() {
    const saved = localStorage.getItem('digitalLab_V2');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);

            // Reset to full default then merge saved data on top
            // This ensures new schema keys (in default) are preserved if missing in saved
            const freshDefault = JSON.parse(JSON.stringify(defaultAppState));

            const mergeRecursive = (target, source) => {
                for (let key in source) {
                    if (source.hasOwnProperty(key)) {
                        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                            if (!target[key]) target[key] = {};
                            mergeRecursive(target[key], source[key]);
                        } else {
                            target[key] = source[key];
                        }
                    }
                }
            };

            // Merge into fresh default
            mergeRecursive(freshDefault, parsed);
            appState = freshDefault;

            // Explicit Patch for Day 3 new fields (Legacy Support)
            const d3d = appState.experiments.day3.data;
            if (d3d) {
                if (d3d.p1_text === undefined) d3d.p1_text = '';
                if (d3d.p2_text === undefined) d3d.p2_text = '';
                if (d3d.coag_text === undefined) d3d.coag_text = '';
            }

        } catch (e) {
            console.error("Load state error", e);
        }
    }
}

function updateUIFromState() {
    // Global User Info
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    setVal('global-class', appState.user.className);
    setVal('global-attendance', appState.user.attendanceId);
    setVal('global-name', appState.user.studentName);

    // Sync Side Profile
    syncSideProfile();

    // Experiment Info
    ['day1', 'day2', 'day3'].forEach(d => {
        const n = d.slice(-1);
        const info = appState.experiments[d].info;
        setVal(`d${n}-date`, info.date);

        // Seat
        if (info.seat) {
            const [alpha, num] = info.seat.split('-');
            setVal(`d${n}-seat-alpha`, alpha);
            setVal(`d${n}-seat-num`, num);
            setVal(`d${n}-seat`, info.seat);
        }

        // Partners
        renderPartners(d);

        // Safety
        const sStatus = document.getElementById(`d${n}-safety-status`);
        if (sStatus) {
            const allDone = appState.experiments[d].safety.every(s => s);
            sStatus.textContent = allDone ? '済' : '未済';
            sStatus.className = `academic-badge ${allDone ? 'done' : ''}`;
        }

        // Student Info Sync (Self)
        setVal(`d${n}-self-id`, appState.user.attendanceId);
        setVal(`d${n}-self-name`, appState.user.studentName);

        // Tools
        renderTools(d);

        // Photos
        Object.keys(appState.experiments[d].photos).forEach(k => {
            let targetId = '';

            // Day 1: Single apparatus photo
            if (d === 'day1') {
                targetId = 'dz-1-apparatus';
            }
            // Day 2: Electrode and apparatus photos
            else if (d === 'day2') {
                if (k === 'electrode') targetId = 'dz-2-electrode';
                else if (k === 'apparatus') targetId = 'dz-2-apparatus';
            }
            // Day 3: Multiple photos
            else if (d === 'day3') {
                if (k === 'target') targetId = 'dz-3-target';
                else if (k === 'p1_app') targetId = 'dz-3-p1-app';
                else if (k === 'p1_wat') targetId = 'dz-3-p1-wat';
                else if (k === 'p2_app') targetId = 'dz-3-p2-app';
                else if (k === 'p2_wat') targetId = 'dz-3-p2-wat';
                else if (k === 'coag') targetId = 'dz-3-coag';
            }

            const el = document.getElementById(targetId);
            if (el) renderPhoto(el, d, k);
        });
        // Refs
        renderRefs(d);

        // Discussion
        const discVal = appState.experiments[d].discussion || '';
        setVal(`d${n}-discussion`, discVal);
        updateCounter(`d${n}-discussion-count`, discVal);
    });

    renderAllQuestions();

    // Day 1: Method Text
    if (document.getElementById('d1-method-text')) {
        document.getElementById('d1-method-text').value = appState.experiments.day1.method_text || '';
        updateCounter('d1-method-count', appState.experiments.day1.method_text || '');
    }

    // Specific Data fields for Day 1
    const d1Data = appState.experiments.day1.data;
    if (d1Data.melting) {
        const m = d1Data.melting;
        if (document.getElementById('d1-m1')) document.getElementById('d1-m1').innerText = m.m1;
        if (document.getElementById('d1-m2')) document.getElementById('d1-m2').innerText = m.m2;
        if (document.getElementById('d1-m3')) document.getElementById('d1-m3').innerText = m.m3;
        // Trigger avg calc visual
        const event = new Event('input');
        const el = document.getElementById('d1-m1');
        if (el) el.dispatchEvent(event);
    }

    // Transfer Table
    if (d1Data.transfer && d1Data.transfer.length > 0) {
        const tbody = document.querySelector('#table-transfer-1 tbody');
        if (tbody) {
            tbody.innerHTML = d1Data.transfer.map(r => `
                <tr>
                    <td contenteditable>${r[0]}</td>
                    <td contenteditable>${r[1] || ''}</td>
                    <td contenteditable>${r[2] || ''}</td>
                    <td contenteditable>${r[3] || ''}</td>
                </tr>
            `).join('');
        }
    }

    // Literature
    const lit = appState.experiments.day1.lit;
    setVal('d1-lit-cu', lit.cu);
    setVal('d1-lit-al', lit.al || lit.lit_al); // Handle key mismatch
    setVal('d1-lit-sus', lit.sus || lit.lit_sus);
    setVal('d1-lit-cu-url', lit['cu-url']);
    setVal('d1-lit-al-url', lit['al-url']);
    setVal('d1-lit-sus-url', lit['sus-url']);

    // Day 2 Data (Multi-Pattern)
    const d2Data = appState.experiments.day2.data;
    ['A', 'B', 'C'].forEach(p => {
        const tbody = document.querySelector(`#table-discharge-2${p} tbody`);
        if (tbody) {
            const data = d2Data[`discharge${p}`] || [];
            if (data.length > 0) {
                tbody.innerHTML = data.map(r => `
                    <tr>
                        <td contenteditable>${r[0]}</td>
                        <td contenteditable>${r[1] || ''}</td>
                        <td contenteditable>${r[2] || ''}</td>
                        <td class="calc-cell">${r[3] || ''}</td>
                    </tr>
                `).join('');
            } else {
                // Default rows if empty
                tbody.innerHTML = [0, 5, 10, 15].map(time => `
                    <tr>
                        <td contenteditable>${time}</td>
                        <td contenteditable></td>
                        <td contenteditable></td>
                        <td class="calc-cell">0</td>
                    </tr>
                `).join('');
            }
        }
    });

    // Day 2 Charge Table (Determination of Patterns)
    const tChargeBody = document.querySelector('#table-charge-2 tbody');
    if (tChargeBody) {
        const patternColors = {
            'パターンA': '#8b5cf6',
            'パターンB': '#ec4899',
            'パターンC': '#10b981'
        };

        const colorizePattern = (pattern) => {
            const color = patternColors[pattern] || '#000';
            return `<span style="color: ${color}; font-weight: bold;">${pattern}</span>`;
        };

        if (d2Data.charge && d2Data.charge.length > 0) {
            tChargeBody.innerHTML = d2Data.charge.map(r => `
                <tr>
                    <td>${colorizePattern(r[0] || '')}</td>
                    <td contenteditable>${r[1] || ''}</td>
                    <td contenteditable>${r[2] || ''}</td>
                    <td contenteditable>${r[3] || ''}</td>
                </tr>
            `).join('');
        } else {
            // Default rows
            tChargeBody.innerHTML = ['パターンA', 'パターンB', 'パターンC'].map(p => `
                <tr>
                    <td>${colorizePattern(p)}</td>
                    <td contenteditable></td>
                    <td contenteditable></td>
                    <td contenteditable></td>
                </tr>
            `).join('');
        }
    }

    // Day 2 Assembly Method
    if (document.getElementById('d2-assembly-method')) {
        document.getElementById('d2-assembly-method').value = d2Data.assembly_method || '';
        updateCounter('d2-method-count', d2Data.assembly_method || '');
    }

    // Handle legacy discharge data if exists
    if (d2Data.discharge && d2Data.discharge.length > 0 && d2Data.dischargeA.length === 0) {
        appState.experiments.day2.data.dischargeA = d2Data.discharge;
        delete appState.experiments.day2.data.discharge;
    }

    // Day 3 Data
    const d3Data = appState.experiments.day3.data;
    setVal('d3-p1-text', d3Data.p1_text);
    setVal('d3-p2-text', d3Data.p2_text);
    setVal('d3-coag-text', d3Data.coag_text);

    if (d3Data.clarity) {
        const tbody = document.querySelector('#table-clarity-3 tbody');
        if (tbody) {
            const labels = [
                '<span style="background:rgba(148, 163, 184, 0.2); border:1px solid rgba(148, 163, 184, 1); color:#475569; padding:2px 6px; border-radius:4px;">浄化対象の水</span>',
                '<span style="background:rgba(59, 130, 246, 0.2); border:1px solid rgba(59, 130, 246, 1); color:#1d4ed8; padding:2px 6px; border-radius:4px;">試作検討①</span>',
                '<span style="background:rgba(16, 185, 129, 0.2); border:1px solid rgba(16, 185, 129, 1); color:#047857; padding:2px 6px; border-radius:4px;">試作検討②</span>'
            ];
            tbody.innerHTML = d3Data.clarity.map((v, i) => `
                <tr>
                    <td>${labels[i]}</td>
                    <td contenteditable>${v}</td>
                </tr>
            `).join('');
        }
    }
}

function syncSideProfile() {
    const nameEl = document.getElementById('display-student-name');
    const idEl = document.getElementById('display-student-id');
    if (nameEl) nameEl.textContent = appState.user.studentName || 'ゲスト';
    if (idEl) idEl.textContent = `${appState.user.className} ${appState.user.attendanceId}番`;
}

function updateCounter(id, text, min = 200) {
    const el = document.getElementById(id);
    if (el) {
        const len = text ? text.length : 0;
        el.textContent = `${len} / ${min}文字`;
        if (len >= min) el.classList.add('valid');
        else el.classList.remove('valid');
    }
}

// --- History Tracker ---
// --- History Tracker ---
function addHistoryEntry(type, details, tags = []) {
    if (!appState.history) appState.history = [];

    // Ensure tags is array and has default
    if (!Array.isArray(tags)) tags = [tags];
    if (tags.length === 0) tags = ['all'];

    // Duplicate check: skip if the same details were just added
    if (appState.history.length > 0) {
        const last = appState.history[0];
        if (last.type === type && last.details === details) {
            last.timestamp = new Date().toISOString();
            last.user = appState.user.studentName || '未設定'; // Update user too
            // Merge tags if needed, or just update
            last.tags = [...new Set([...(last.tags || []), ...tags])];
            saveState();
            renderHistory();
            return;
        }
    }

    const entry = {
        id: Date.now(),
        type: type, // 'edit', 'import', 'pdf', 'init', 'share', 'backup'
        user: appState.user.studentName || '未設定',
        timestamp: new Date().toISOString(),
        details: details,
        tags: tags // ['day1'], ['all'], etc.
    };
    appState.history.unshift(entry);
    saveState();
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('dashboard-history-list');
    if (!container) return;

    if (!appState.history || appState.history.length === 0) {
        container.innerHTML = '<div class="history-item" style="color:var(--text-muted);">履歴はありません</div>';
        return;
    }

    const typeLabels = {
        'edit': { label: '編集', class: 'type-edit' },
        'import': { label: '読込', class: 'type-import' },
        'pdf': { label: '出力', class: 'type-pdf' },
        'share': { label: '共有', class: 'type-share' },
        'backup': { label: '保存', class: 'type-share' },
        'init': { label: '作成', class: 'type-edit' }
    };

    // Dashboard shows ALL history
    container.innerHTML = appState.history.map(h => {
        const t = typeLabels[h.type] || { label: '記録', class: '' };
        const d = new Date(h.timestamp);
        const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;

        // Optional: Show tag indicator? User didn't ask, but might be nice. 
        // For now, keep it simple as requested.
        return `
            <div class="history-item">
                <span class="history-type ${t.class}">${t.label}</span>
                <span>${h.details}</span>
                <span class="history-time">${timeStr} by ${h.user}</span>
            </div>
        `;
    }).join('');
}

// Throttled history for edits
let editHistoryTimer = null;
function logEditHistory(details, tags = []) {
    if (editHistoryTimer) clearTimeout(editHistoryTimer);
    editHistoryTimer = setTimeout(() => {
        addHistoryEntry('edit', details, tags);
    }, 5000); // 5 sec throttle
}

// --- Rubric PDF Generation ---
async function generateRubricPDF() {
    // Password Check
    const pw = prompt("教員用パスワードを入力してください:");
    if (pw !== "9784563046378") {
        alert("パスワードが正しくありません。");
        return;
    }

    // 1. Prepare Data
    const d1 = appState.experiments.day1;
    const d2 = appState.experiments.day2;
    const d3 = appState.experiments.day3;

    const user = appState.user.studentName || '未設定';
    const id = `${appState.user.className} ${appState.user.attendanceId}番`;
    const date = new Date().toLocaleDateString('ja-JP');

    // Calculate Totals (Weighted 50% Effort, 50% Report, Total 100)
    const sumEffort = d1.scores.effort + d2.scores.effort + d3.scores.effort; // Max 150
    const sumReport = d1.scores.report + d2.scores.report + d3.scores.report; // Max 150

    // Normalize to 50 points each
    const finalEffort = Math.round((sumEffort / 150) * 50);
    const finalReport = Math.round((sumReport / 150) * 50);
    const finalTotal = finalEffort + finalReport;

    // 2. Build HTML Content for Print
    const container = document.getElementById('pdf-rubric-summary');
    if (!container) return;

    // Helper for Star String
    const getStars = (current, max) => {
        const ratio = max > 0 ? (current / max) : 0;
        const count = Math.round(ratio * 10);
        const stars = '★'.repeat(count) + '☆'.repeat(10 - count);
        return `<span style="color:#f59e0b; font-size:1.2em;">${stars}</span> <span style="font-weight:bold; font-size:0.9em;">(${current}/${max})</span>`;
    };

    // Re-calculate some specific breakdown scores for display
    // Day 1
    const d1_eff_basic = (appState.user.studentName && d1.info.seat) ? 5 : 0;
    const d1_eff_safe = d1.safety.every(s => s) ? 10 : 0;
    const d1_eff_tool = Math.min(d1.tools.length, 5);
    const d1_eff_photo = d1.photos.apparatus ? 10 : 0;
    const d1_eff_data = (d1.data.melting.m1 && d1.data.melting.m2 && d1.lit.cu) ? 10 : 0;
    const d1_eff_ref = (d1.refs && d1.refs.length > 0) ? Math.min(d1.refs.length * 2, 10) : 0;

    const d1_rep_meth = Math.round(Math.min((d1.method_text || '').length / 200, 1.0) * 5);
    const d1_rep_disc = Math.round(Math.min((d1.discussion || '').length / 200, 1.0) * 9);
    // Questions sum
    let d1_rep_q = 0;
    d1.questions.forEach(q => {
        const kwCheck = q.keywords.every(kw => (q.text || '').includes(kw));
        d1_rep_q += (Math.min((q.text || '').length / 200, 1.0) * 6) + (kwCheck ? 6 : 0);
    });
    d1_rep_q = Math.round(d1_rep_q);

    // Day 2
    let d2_eff_basic = 0;
    if (appState.user.studentName) d2_eff_basic += 5;
    if (d2.info.seat) d2_eff_basic += 5;
    const d2_eff_safe = d2.safety.every(s => s) ? 10 : 0;
    const d2_eff_tool = d2.tools.length > 0 ? 10 : 0;
    const d2_eff_photo = Object.values(d2.photos).some(p => p !== null) ? 20 : 0;

    // Day 2 Report (Strict text checks)
    const d2_rep_assem = ((d2.data.assembly_method || '').length >= 100) ? 15 : ((d2.data.assembly_method || '').length >= 50 ? 10 : ((d2.data.assembly_method || '').length >= 20 ? 5 : 0));
    const d2_rep_disc = ((d2.discussion || '').length >= 200) ? 15 : ((d2.discussion || '').length >= 100 ? 10 : ((d2.discussion || '').length >= 50 ? 5 : 0));
    let d2_rep_q = 0;
    d2.questions.forEach(q => {
        if (q.text.length >= q.minChar && q.keywords.every(kw => q.text.includes(kw))) d2_rep_q += 5;
        else if (q.text.length > 50) d2_rep_q += 2;
    });
    const d2_rep_ref = (d2.refs && d2.refs.length > 0) ? Math.min(d2.refs.length, 5) : 0;

    // Day 3
    let d3_eff_basic = 0;
    if (appState.user.studentName) d3_eff_basic += 5;
    if (d3.info.seat) d3_eff_basic += 5;
    const d3_eff_safe = d3.safety.every(s => s) ? 10 : 0;
    const d3_eff_tool = d3.tools.length > 0 ? 10 : 0;
    const d3_eff_photo = Math.min(Object.values(d3.photos).filter(p => p !== null).length * 4, 20);

    // Day 3 Report
    const scoreTextD3 = (txt) => { if (!txt) return 0; if (txt.length >= 100) return 5; if (txt.length >= 50) return 2; return 0; };
    const d3_rep_proc = scoreTextD3(d3.data.p1_text) + scoreTextD3(d3.data.p2_text) + scoreTextD3(d3.data.coag_text);
    const d3_rep_disc = ((d3.discussion || '').length >= 200) ? 15 : ((d3.discussion || '').length >= 100 ? 10 : ((d3.discussion || '').length >= 50 ? 5 : 0));
    let d3_rep_q = 0;
    d3.questions.forEach(q => {
        if (q.text.length >= q.minChar && q.keywords.every(kw => q.text.includes(kw))) d3_rep_q += 5;
        else if (q.text.length > 50) d3_rep_q += 2;
    });
    const d3_rep_ref = (d3.refs && d3.refs.length > 0) ? Math.min(d3.refs.length, 5) : 0;


    const html = `
        <div style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px; margin-bottom:20px;">
            <h1 style="font-size:24pt; margin:0;">実験実習 総合評価報告書</h1>
            <p style="margin:5px 0 0 0;">Comprehensive Evaluation Report</p>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:12pt; border-bottom:1px solid #ccc; padding-bottom:10px;">
            <div><strong>氏名:</strong> ${user}</div>
            <div><strong>クラス・番号:</strong> ${id}</div>
            <div><strong>発行日:</strong> ${date}</div>
        </div>

        <!-- Summary Table -->
        <h3 style="background:#eee; padding:5px 10px; border-left:5px solid #333;">■ 総合成績サマリー</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:11pt;">
            <thead>
                <tr style="background:#f9fafb; border-bottom:2px solid #333;">
                    <th style="padding:10px; text-align:left;">実験テーマ</th>
                    <th style="padding:10px; text-align:center;">取り組み点 (Effort)</th>
                    <th style="padding:10px; text-align:center;">レポート点 (Report)</th>
                    <th style="padding:10px; text-align:center;">小計 (Subtotal)</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom:1px solid #ccc;">
                    <td style="padding:10px;"><strong>実験① 熱の可視化</strong></td>
                    <td style="padding:10px; text-align:center;">${d1.scores.effort} / 50</td>
                    <td style="padding:10px; text-align:center;">${d1.scores.report} / 50</td>
                    <td style="padding:10px; text-align:center;">${d1.scores.effort + d1.scores.report} / 100</td>
                </tr>
                <tr style="border-bottom:1px solid #ccc;">
                    <td style="padding:10px;"><strong>実験② 燃料電池</strong></td>
                    <td style="padding:10px; text-align:center;">${d2.scores.effort} / 50</td>
                    <td style="padding:10px; text-align:center;">${d2.scores.report} / 50</td>
                    <td style="padding:10px; text-align:center;">${d2.scores.effort + d2.scores.report} / 100</td>
                </tr>
                <tr style="border-bottom:1px solid #ccc;">
                    <td style="padding:10px;"><strong>実験③ 水処理装置</strong></td>
                    <td style="padding:10px; text-align:center;">${d3.scores.effort} / 50</td>
                    <td style="padding:10px; text-align:center;">${d3.scores.report} / 50</td>
                    <td style="padding:10px; text-align:center;">${d3.scores.effort + d3.scores.report} / 100</td>
                </tr>
                <tr style="background:#f0f9ff; border-top:2px solid #333; font-weight:bold; font-size:12pt;">
                    <td style="padding:10px;">最終評価 (100点換算)</td>
                    <td style="padding:10px; text-align:center;">${finalEffort} / 50</td>
                    <td style="padding:10px; text-align:center;">${finalReport} / 50</td>
                    <td style="padding:10px; text-align:center; color:#dc2626; font-size:1.2em;">${finalTotal} / 100</td>
                </tr>
            </tbody>
        </table>
        
        <div style="font-size:0.9rem; color:#666; text-align:right; margin-bottom:2rem;">
            ※ 最終評価 = (全実験の取り組み点合計 ÷ 150 × 50) + (全実験のレポート点合計 ÷ 150 × 50)<br>
            ※ 本スコアは、最終評点ではないので注意してください。M2の実験当日の取り組みや、レポートの記述内容を確認し、総合精査して評価します。
        </div>

        <!-- Day 1 Details -->
        <h3 style="background:#fef3c7; color:#92400e; padding:5px 10px; border-left:5px solid #d97706; margin-top:30px;">🔥 実験① 詳細評価</h3>
        <div style="display:flex; gap:20px;">
            <div style="flex:1;">
                <h4 style="border-bottom:1px solid #ccc; color:#2563eb;">取り組み (Effort)</h4>
                <ul style="list-style:none; padding:0; font-size:10pt;">
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">基本情報 (5): ${getStars(d1_eff_basic, 5)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">安全確認 (10): ${getStars(d1_eff_safe, 10)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">器具登録 (5): ${getStars(d1_eff_tool, 5)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">写真記録 (10): ${getStars(d1_eff_photo, 10)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">データ入力 (10): ${getStars(d1_eff_data, 10)}</li>
                    <li style="margin-bottom:5px;">参考文献 (10): ${getStars(d1_eff_ref, 10)}</li>
                </ul>
            </div>
            <div style="flex:1;">
                <h4 style="border-bottom:1px solid #ccc; color:#059669;">レポート (Report)</h4>
                <ul style="list-style:none; padding:0; font-size:10pt;">
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">装置評価法 (5): ${getStars(d1_rep_meth, 5)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">考察 (9): ${getStars(d1_rep_disc, 9)}</li>
                    <li style="margin-bottom:5px;">調査課題 (36): ${getStars(d1_rep_q, 36)}</li>
                </ul>
            </div>
        </div>

        <!-- Day 2 Details -->
        <h3 style="background:#dcfce7; color:#166534; padding:5px 10px; border-left:5px solid #10b981; margin-top:20px;">🔋 実験② 詳細評価</h3>
        <div style="display:flex; gap:20px;">
            <div style="flex:1;">
                <h4 style="border-bottom:1px solid #ccc; color:#2563eb;">取り組み (Effort)</h4>
                <ul style="list-style:none; padding:0; font-size:10pt;">
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">基本情報 (10): ${getStars(d2_eff_basic, 10)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">安全確認 (10): ${getStars(d2_eff_safe, 10)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">器具登録 (10): ${getStars(d2_eff_tool, 10)}</li>
                    <li style="margin-bottom:5px;">写真記録 (20): ${getStars(d2_eff_photo, 20)}</li>
                </ul>
            </div>
            <div style="flex:1;">
                <h4 style="border-bottom:1px solid #ccc; color:#059669;">レポート (Report)</h4>
                <ul style="list-style:none; padding:0; font-size:10pt;">
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">組立方法 (15): ${getStars(d2_rep_assem, 15)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">考察 (15): ${getStars(d2_rep_disc, 15)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">調査課題 (15): ${getStars(d2_rep_q, 15)}</li>
                    <li style="margin-bottom:5px;">参考文献 (5): ${getStars(d2_rep_ref, 5)}</li>
                </ul>
            </div>
        </div>

        <!-- Day 3 Details -->
        <h3 style="background:#dbeafe; color:#1e40af; padding:5px 10px; border-left:5px solid #3b82f6; margin-top:20px;">💧 実験③ 詳細評価</h3>
        <div style="display:flex; gap:20px;">
            <div style="flex:1;">
                <h4 style="border-bottom:1px solid #ccc; color:#2563eb;">取り組み (Effort)</h4>
                <ul style="list-style:none; padding:0; font-size:10pt;">
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">基本情報 (10): ${getStars(d3_eff_basic, 10)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">安全確認 (10): ${getStars(d3_eff_safe, 10)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">器具登録 (10): ${getStars(d3_eff_tool, 10)}</li>
                    <li style="margin-bottom:5px;">写真記録 (20): ${getStars(d3_eff_photo, 20)}</li>
                </ul>
            </div>
            <div style="flex:1;">
                <h4 style="border-bottom:1px solid #ccc; color:#059669;">レポート (Report)</h4>
                <ul style="list-style:none; padding:0; font-size:10pt;">
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">プロセス記録 (15): ${getStars(d3_rep_proc, 15)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">考察 (15): ${getStars(d3_rep_disc, 15)}</li>
                    <li style="margin-bottom:5px; border-bottom:1px dashed #eee;">調査課題 (15): ${getStars(d3_rep_q, 15)}</li>
                    <li style="margin-bottom:5px;">参考文献 (5): ${getStars(d3_rep_ref, 5)}</li>
                </ul>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // 3. Generate PDF
    const { jsPDF } = window.jspdf;

    container.style.display = 'block'; // Make visible for capture

    html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false
    }).then(canvas => {
        container.style.display = 'none'; // Hide again

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        const fname = `総合評価報告書_${user}_${new Date().toISOString().slice(0, 10)}.pdf`;
        pdf.save(fname);

        logEditHistory('総合評価PDFを出力', ['rubric']);
    }).catch(err => {
        console.error('PDF Gen Error:', err);
        container.style.display = 'none';
        alert('PDF作成中にエラーが発生しました。');
    });
}
