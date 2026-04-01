const fs = require('fs');
const path = require('path');

const srcDirs = [
    'frontend/src/pages'
];

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            if (dirPath.endsWith('.jsx')) {
                callback(dirPath);
            }
        }
    });
}

function processFiles() {
    let changedCount = 0;
    srcDirs.forEach(srcDir => {
        const fullDir = path.join('c:\\Users\\javie\\Downloads\\VTB_DEMO', srcDir);
        walkDir(fullDir, function (filePath) {
            let content = fs.readFileSync(filePath, 'utf8');
            let newContent = content.replace(/^[ \t]*console\.log\([^]*?\);\s*$/gm, '');
            // Also handle single line console.log
            newContent = newContent.replace(/console\.log\(.*?\);?/g, '');
            if (content !== newContent) {
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log('Cleaned logs from:', filePath);
                changedCount++;
            }
        });
    });
    console.log('Done cleaning console.log! Files changed:', changedCount);
}

processFiles();
