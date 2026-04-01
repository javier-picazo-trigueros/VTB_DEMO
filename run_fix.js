const fs = require('fs');
const path = require('path');

const filesToFix = [
    'frontend/src/pages/Dashboard.jsx',
    'frontend/src/pages/AdminPanel.jsx',
    'frontend/src/pages/VotingBooth.jsx',
    'frontend/src/pages/ElectionResults.jsx',
    'backend/src/index.ts',
    'backend/src/routes/elections.ts'
];

const replacements = [
    [/ÃƒÂ³/g, 'ó'],
    [/ÃƒÂ¡/g, 'á'],
    [/Ã³/g, 'ó'],
    [/Ã¡/g, 'á'],
    [/Ã©/g, 'é'],
    [/Ã\xAD/g, 'í'],
    [/Ãº/g, 'ú'],
    [/Ã±/g, 'ñ'],
    [/Ã¼/g, 'ü'],
    [/ðŸ—³ï¸/g, '🗳️'],
    [/âœ…/g, '✅'],
    [/ðŸ“Š/g, '📊'],
    [/ðŸ”—/g, '🔗'],
    [/ðŸ”‘/g, '🔑'],
    [/âš¡/g, '⚡'],
    [/ðŸ“¡/g, '📡'],
    [/ðŸ” /g, '🔒'], // Fixed to padlock
    [/â†©/g, '↩'],
    [/â€”/g, '—'],
    [/â€˜/g, "'"],
    [/â€™/g, "'"],
    [/Â¡/g, '¡'],
    [/Â¿/g, '¿'],
    [/â Œ/g, '❌'],
    [/â ³/g, '⏳'],
    [/âš ï¸/g, '⚠️'],
    [/ðŸ“ /g, '📌'],
    [/ðŸ“¤/g, '📤'],
    [/ðŸ“‹/g, '📋'],
    [/ðŸ”„/g, '🔄'],
    [/â† /g, '←'],
    [/â†'/g, '↩'],
    [/â€"/g, '—'],
    [/ðŸ""/g, '🔐'],
    [/ðŸ"¡/g, '📡'],
    [/ðŸ"'/g, '🔑'],
    [/ðŸ"—/g, '🔗'],
    [/ðŸ"Š/g, '📊'],
    // New ones observed
    [/í‰XITO/g, 'ÉXITO'],
    [/í A/g, 'ÍA'],
    [/â °/g, '⏳'], // using hourglass
    [/ðŸ”’/g, '🔒'], 
    [/ðŸ“¥/g, '📥'],
    [/â†’/g, '→'],
    [/íƒ°í…¸í¢â‚¬Å“í… /g, '📊 '],
    [/íƒ°í…¸í¢â‚¬Å“í…/g, '📊'],
    [/íƒâ€ší‚¦/g, '✓'],
    [/í¢â€Å'/g, '┌'],
    [/íƒ°í…¸í¢â€ží‚¢/g, '⏱️'],
    [/íƒâ€ší‚/g, '✓'],
    [/í‚¦/g, '✓'],
    [/Â/g, ''],
    [/Ã/g, 'í'],
    [/ðŸ”\s/g, '🔎 '],
];

let changedCount = 0;
filesToFix.forEach(relPath => {
    const filePath = path.join(__dirname, relPath);
    if (!fs.existsSync(filePath)) {
        console.log("Not found:", filePath);
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    replacements.forEach(([regex, replacement]) => {
        newContent = newContent.replace(regex, replacement);
    });
    // Additional manual string fixes
    newContent = newContent.replace(/AUDITORí A/g, 'AUDITORÍA');
    newContent = newContent.replace(/ðŸ” Ver en el explorador/g, '🔍 Ver en el explorador');
    newContent = newContent.replace(/ðŸ” Privacidad/g, '🔒 Privacidad');

    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Fixed:', filePath);
        changedCount++;
    }
});
console.log('Done! Files changed:', changedCount);
