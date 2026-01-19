
function updateRubricStars() {
    const starColor = '#f59e0b'; // Gold color like dashboard
    const emptyColor = '#e5e7eb'; // Light gray

    const renderStars = (current, max) => {
        const ratio = max > 0 ? (current / max) : 0;
        const starCount = Math.round(ratio * 10);

        let html = '';
        for (let i = 0; i < 10; i++) {
            if (i < starCount) {
                html += `<span style="color: ${starColor};">★</span>`;
            } else {
                html += `<span style="color: ${emptyColor};">★</span>`;
            }
        }
        // Append score text
        html += `<span style="margin-left:8px; font-weight:bold; color: #666; font-size: 0.85em;">(${current} / ${max})</span>`;
        return html;
    };

    // Helper to safely set HTML
    const setH = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    const exp1 = appState.experiments.day1;
    if (exp1) {
        // --- Day 1 Effort ---
        let s_basic = (appState.user.studentName && exp1.info.seat) ? 5 : 0;
        setH('r-d1-e1', renderStars(s_basic, 5));

        let s_safety = exp1.safety.every(s => s) ? 10 : 0;
        setH('r-d1-e2', renderStars(s_safety, 10));

        let s_tools = Math.min(exp1.tools.length, 5);
        setH('r-d1-e3', renderStars(s_tools, 5));

        let s_photo = exp1.photos.apparatus ? 10 : 0;
        setH('r-d1-e4', renderStars(s_photo, 10));

        let hasMelting = exp1.data.melting.m1 && exp1.data.melting.m2;
        let hasLit = exp1.lit.cu;
        let s_data = (hasMelting && hasLit) ? 10 : 0;
        setH('r-d1-e5', renderStars(s_data, 10));

        let s_refs = 0;
        if (exp1.refs && exp1.refs.length > 0) s_refs = Math.min(exp1.refs.length * 2, 10);
        setH('r-d1-e6', renderStars(s_refs, 10));


        // --- Day 1 Report ---
        let mText = exp1.method_text || '';
        let s_method = Math.round(Math.min(mText.length / 200, 1.0) * 5);
        setH('r-d1-r1', renderStars(s_method, 5));

        let dText = exp1.discussion || '';
        let s_disc = Math.round(Math.min(dText.length / 200, 1.0) * 9);
        setH('r-d1-r2', renderStars(s_disc, 9));

        let s_q_total = 0;
        exp1.questions.forEach(q => {
            let qText = q.text || '';
            let kwCheck = q.keywords.every(kw => qText.includes(kw));
            let lenScore = Math.min(qText.length / 200, 1.0) * 6;
            let kwScore = kwCheck ? 6 : 0;
            s_q_total += (lenScore + kwScore);
        });
        setH('r-d1-r3', renderStars(Math.round(s_q_total), 36));
    }

    const exp2 = appState.experiments.day2;
    if (exp2) {
        // --- Day 2 Effort ---
        let s_basic = 0;
        if (appState.user.studentName) s_basic += 5;
        if (exp2.info.seat) s_basic += 5;
        setH('r-d2-e1', renderStars(s_basic, 10));

        let s_safety = exp2.safety.every(s => s) ? 10 : 0;
        setH('r-d2-e2', renderStars(s_safety, 10));

        let s_tools = exp2.tools.length > 0 ? 10 : 0;
        setH('r-d2-e3', renderStars(s_tools, 10));

        let s_photo = Object.values(exp2.photos).some(p => p !== null) ? 20 : 0;
        setH('r-d2-e4', renderStars(s_photo, 20));

        // --- Day 2 Report ---
        let amTxt = exp2.data.assembly_method || '';
        let s_assembly = 0;
        if (amTxt.length >= 100) s_assembly = 15;
        else if (amTxt.length >= 50) s_assembly = 10;
        else if (amTxt.length >= 20) s_assembly = 5;
        setH('r-d2-r1', renderStars(s_assembly, 15));

        let discTxt = exp2.discussion || '';
        let s_disc = 0;
        if (discTxt.length >= 200) s_disc = 15;
        else if (discTxt.length >= 100) s_disc = 10;
        else if (discTxt.length >= 50) s_disc = 5;
        setH('r-d2-r2', renderStars(s_disc, 15));

        let s_q = 0;
        exp2.questions.forEach(q => {
            if (q.text.length >= q.minChar && q.keywords.every(kw => q.text.includes(kw))) s_q += 5;
            else if (q.text.length > 50) s_q += 2;
        });
        setH('r-d2-r3', renderStars(s_q, 15));

        let s_refs = 0;
        if (exp2.refs && exp2.refs.length > 0) s_refs = Math.min(exp2.refs.length, 5);
        setH('r-d2-r4', renderStars(s_refs, 5));
    }

    const exp3 = appState.experiments.day3;
    if (exp3) {
        // --- Day 3 Effort ---
        let s_basic = 0;
        if (appState.user.studentName) s_basic += 5;
        if (exp3.info.seat) s_basic += 5;
        setH('r-d3-e1', renderStars(s_basic, 10));

        let s_safety = exp3.safety.every(s => s) ? 10 : 0;
        setH('r-d3-e2', renderStars(s_safety, 10));

        let s_tools = exp3.tools.length > 0 ? 10 : 0;
        setH('r-d3-e3', renderStars(s_tools, 10));

        let photoCount = Object.values(exp3.photos).filter(p => p !== null).length;
        let s_photo = Math.min(photoCount * 4, 20);
        setH('r-d3-e4', renderStars(s_photo, 20));

        // --- Day 3 Report ---
        let s_process = 0;
        const scoreText = (txt) => {
            if (!txt) return 0;
            if (txt.length >= 100) return 5;
            if (txt.length >= 50) return 2;
            return 0;
        };
        s_process += scoreText(exp3.data.p1_text);
        s_process += scoreText(exp3.data.p2_text);
        s_process += scoreText(exp3.data.coag_text);
        setH('r-d3-r1', renderStars(s_process, 15));

        let discTxt = exp3.discussion || '';
        let s_disc = 0;
        if (discTxt.length >= 200) s_disc = 15;
        else if (discTxt.length >= 100) s_disc = 10;
        else if (discTxt.length >= 50) s_disc = 5;
        setH('r-d3-r2', renderStars(s_disc, 15));

        let s_q = 0;
        exp3.questions.forEach(q => {
            if (q.text.length >= q.minChar && q.keywords.every(kw => q.text.includes(kw))) s_q += 5;
            else if (q.text.length > 50) s_q += 2;
        });
        setH('r-d3-r3', renderStars(s_q, 15));

        let s_refs = 0;
        if (exp3.refs && exp3.refs.length > 0) s_refs = Math.min(exp3.refs.length, 5);
        setH('r-d3-r4', renderStars(s_refs, 5));
    }
}
