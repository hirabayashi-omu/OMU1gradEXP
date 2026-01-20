/**
 * Debug Utilities for Digital Lab Report System
 * Provides dummy data loading for testing purposes.
 * Activate by adding ?debug=1 to the URL.
 */

const DUMMY_STUDENTS = [
    {
        name: "佐藤 謙一", id: "01", class: "1年1組", level: 0.9,
        survey: {
            q1: { mech: "3", energy: "2", water: "2", chem: "3" },
            q2: { mech: "5", energy: "4", water: "4", chem: "4" },
            q3: ["熱の可視化", "燃料電池"], q4: "燃料電池",
            q5: { think: "4", connect: "5", flow: "4", team: "5" },
            q6: ["M", "I"], q_free: "将来はロボット開発に携わりたいため、機械工学に非常に興味が湧きました。"
        }
    },
    {
        name: "鈴木 芽衣", id: "15", class: "1年2組", level: 0.7,
        survey: {
            q1: { mech: "2", energy: "3", water: "5", chem: "4" },
            q2: { mech: "3", energy: "4", water: "5", chem: "5" },
            q3: ["水処理装置"], q4: "水処理装置",
            q5: { think: "5", connect: "4", flow: "5", team: "4" },
            q6: ["E"], q_free: "環境問題への関心がありましたが、今回の実習で化学工学の重要性を知ることができました。"
        }
    },
    {
        name: "田中 太郎", id: "32", class: "1年3組", level: 0.4,
        survey: {
            q1: { mech: "4", energy: "4", water: "3", chem: "2" },
            q2: { mech: "5", energy: "5", water: "3", chem: "3" },
            q3: ["燃料電池", "熱の可視化"], q4: "熱の可視化",
            q5: { think: "4", connect: "3", flow: "4", team: "5" },
            q6: ["M", "D"], q_free: "目に見えない熱が色として見えるのが面白かったです。"
        }
    }
];

function getMockExperiments(level) {
    const repeatStr = (char, len) => char.repeat(Math.max(1, Math.floor(len)));
    // Minimal 1x1 Red Pixel for valid Base64 image
    const mockImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKwMjqAAAAAElFTkSuQmCC";

    // Helper to generate consistent tools objects
    const makeTools = (list) => list.map(name => ({
        name: name,
        usage: "使用目的テストデータ" // Generic usage text
    }));

    // Helper to generate consistent references
    const makeRefs = (list) => list.map((title, i) => ({
        title: title,
        author: "著者" + (i + 1),
        source: "文献ソース"
    }));

    return {
        day1: {
            info: {
                partners: level > 0.5 ? [{ id: "01", name: "相方A" }, { id: "02", name: "相方B" }] : [],
                seat: level > 0.5 ? "A-01" : "",
                date: "2026-01-20"
            },
            safety: level > 0.8 ? [true, true, true] : [true, true, false],
            tools: level > 0.4 ? makeTools(["放射温度計", "サーモカメラ"]) : [],
            photos: level > 0.6 ? { apparatus: mockImg } : {},
            data: {
                melting: { m1: 60, m2: 62, m3: 61 },
                transfer: [
                    [0, 25, 25, 25],
                    [5, 40, 30, 28],
                    [10, 55, 35, 30],
                    [15, 65, 40, 32]
                ]
            },
            method_text: repeatStr("熱可視化実験の手順に関する記述。このテキストはダミーです。", 5 * level),
            discussion: repeatStr("考察の記述。熱伝導の違いについて記述します。", 15 * level),
            questions: [
                { text: repeatStr("問1の回答ダミーです。", 5 * level) },
                { text: repeatStr("問2の回答ダミーです。", 5 * level) },
                { text: repeatStr("問3の回答ダミーです。", 5 * level) }
            ],
            refs: level > 0.7 ? makeRefs(["伝熱工学概論"]) : []
        },
        day2: {
            info: {
                partners: [{ id: "03", name: "相方C" }],
                seat: "B-05",
                date: "2026-01-21"
            },
            safety: [true, true, true],
            tools: makeTools(["ピペット"]),
            photos: level > 0.5 ? { electrode: mockImg, apparatus: mockImg } : {},
            data: {
                charge: [["0", "1.2", "0.5", "Charging"], ["1", "1.3", "0.5", "Charging"]],
                dischargeA: [[0, 1.2, 0.5, 0.6], [10, 1.1, 0.5, 0.55]],
                dischargeB: [],
                dischargeC: [],
                assembly_method: repeatStr("燃料電池の組み立て手順記述。", 10 * level)
            },
            discussion: repeatStr("燃料電池の考察記述。", 20 * level),
            questions: [
                { text: repeatStr("FC問1回答。", 5 * level) },
                { text: repeatStr("FC問2回答。", 5 * level) },
                { text: repeatStr("FC問3回答。", 5 * level) }
            ],
            refs: []
        },
        day3: {
            info: {
                partners: [{ id: "04", name: "相方D" }],
                seat: "C-10",
                date: "2026-01-22"
            },
            safety: [true, true, true],
            tools: makeTools(["活性炭フィルター"]),
            photos: { target: mockImg, p1_app: mockImg, p1_wat: mockImg, p2_app: mockImg, p2_wat: mockImg, coag: mockImg },
            data: {
                p1_text: "プロトタイプ1の結果記述",
                clarity: [1, 3, 5],
                coag_text: repeatStr("凝集実験の観察記録。", 10 * level)
            },
            discussion: repeatStr("水処理装置の考察。", 15 * level),
            questions: [
                { text: repeatStr("水処理問1回答。", 5 * level) },
                { text: repeatStr("水処理問2回答。", 5 * level) },
                { text: repeatStr("水処理問3回答。", 5 * level) }
            ],
            refs: level > 0.7 ? makeRefs(["水処理ハンドブック"]) : []
        }
    };
}

window.loadDummyData = function (index) {
    if (!confirm("【注意】現在の入力内容は全て上書きされます。\n選択したダミーデータを読み込みますか？")) return;

    const s = DUMMY_STUDENTS[index];
    const mockExp = getMockExperiments(s.level);

    // Ensure appState exists
    if (typeof appState === 'undefined') {
        alert("エラー: アプリケーションの状態が見つかりません。");
        return;
    }

    // 1. Basic User Info
    appState.user.className = s.class;
    appState.user.attendanceId = s.id;
    appState.user.studentName = s.name;
    appState.user.isTeacher = false; // Reset teacher mode

    // 2. Survey Data
    appState.survey = JSON.parse(JSON.stringify(s.survey));

    // 3. Experiment Data
    ['day1', 'day2', 'day3'].forEach(dayKey => {
        const target = appState.experiments[dayKey];
        const source = mockExp[dayKey];

        // Merge Info
        if (source.info) Object.assign(target.info, source.info);

        // Merge Safety & Tools
        if (source.safety) target.safety = [...source.safety];
        if (source.tools) target.tools = JSON.parse(JSON.stringify(source.tools));

        // Merge Photos
        if (source.photos) Object.assign(target.photos, source.photos);

        // Merge Data
        if (source.data) {
            // Specifically handling nested objects like 'melting' or 'transfer' if needed
            // But Object.assign is shallow.
            // For melting (object), we need deeper merge or replacement
            if (source.data.melting) Object.assign(target.data.melting, source.data.melting);
            if (source.data.transfer) target.data.transfer = [...source.data.transfer]; // Array replace
            if (source.data.charge) target.data.charge = JSON.parse(JSON.stringify(source.data.charge));
            if (source.data.dischargeA) target.data.dischargeA = JSON.parse(JSON.stringify(source.data.dischargeA));
            // Simple fields
            if (source.data.assembly_method) target.data.assembly_method = source.data.assembly_method;
            if (source.data.p1_text) target.data.p1_text = source.data.p1_text;
            if (source.data.coag_text) target.data.coag_text = source.data.coag_text;
            if (source.data.clarity) target.data.clarity = [...source.data.clarity];
        }

        // Texts
        if (source.method_text) target.method_text = source.method_text;
        if (source.discussion) target.discussion = source.discussion;

        // Questions (Update text only)
        if (source.questions) {
            source.questions.forEach((q, i) => {
                if (target.questions[i]) {
                    target.questions[i].text = q.text;
                }
            });
        }

        // Refs
        if (source.refs) target.refs = JSON.parse(JSON.stringify(source.refs));
    });

    // Add History Log
    if (!appState.history) appState.history = [];
    appState.history.push({
        type: 'import',
        timestamp: new Date().toISOString(),
        user: 'System',
        details: `ダミーデータ読み込み: ${s.name} (Lv.${s.level})`,
        tags: ['all']
    });

    // Save to LocalStorage
    saveState();

    // Reload to reflect changes
    location.reload();
};

// Auto-init for debug mode
document.addEventListener('DOMContentLoaded', () => {
    // Check for "debug" query parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('debug')) {
        const debugMenu = document.getElementById('debug-menu-items');
        if (debugMenu) {
            debugMenu.style.display = 'block';
        }
    }
});
