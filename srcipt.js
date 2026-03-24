const canvas = document.getElementById('storyCanvas');
const ctx = canvas.getContext('2d');
let coverImage = new Image();
coverImage.crossOrigin = "Anonymous";
const TTB_KEY = 'ttbtwinwhee0938001';

async function searchBook() {
    const query = document.getElementById('bookSearch').value;
    if (!query) return;
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<div style="padding:10px;">검색 중...</div>';
    resultsDiv.style.display = 'block';

    const apiUrl = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${TTB_KEY}&Query=${encodeURIComponent(query)}&QueryType=Title&MaxResults=5&start=1&SearchTarget=Book&output=js&Version=20131101`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        const rawData = await response.json();
        let content = rawData.contents.trim();
        if (content.endsWith(';')) content = content.substring(0, content.length - 1);
        const data = JSON.parse(content);

        resultsDiv.innerHTML = '';
        if (data.item && data.item.length > 0) {
            data.item.forEach(book => {
                const item = document.createElement('div');
                item.className = 'search-item';
                item.innerHTML = `<img src="${book.cover}"><div class="info"><b>${book.title}</b><br>${book.author}</div>`;
                item.onclick = async () => {
                    const highRes = book.cover.replace('coversum/', 'cover500/');
                    // CORS 우회를 위해 이미지도 프록시 처리
                    const imgProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(highRes)}`;
                    const imgRes = await fetch(imgProxy);
                    const imgData = await imgRes.json();
                    
                    coverImage.onload = () => { resultsDiv.style.display = 'none'; draw(); };
                    coverImage.src = imgData.contents; // Base64 형태로 데이터 전달됨
                    document.getElementById('bookTitleInput').value = book.title;
                    document.getElementById('bookAuthorInput').value = book.author.split('(지은이)')[0];
                };
                resultsDiv.appendChild(item);
            });
        } else { resultsDiv.innerHTML = '<div style="padding:10px;">결과 없음</div>'; }
    } catch (e) { console.error(e); }
}

function updateFontSize(val) { document.getElementById('fontSizeVal').innerText = val; draw(); }
function updateLineHeight(val) { document.getElementById('lineHeightVal').innerText = val; draw(); }
function setSingleColor() { const c1 = document.getElementById('color1').value; document.getElementById('color2').value = c1; draw(); }

function applyPalette() {
    if (!coverImage.src || !coverImage.complete) { alert("책을 선택해주세요."); return; }
    const tempCanvas = document.createElement('canvas');
    const tCtx = tempCanvas.getContext('2d');
    tempCanvas.width = coverImage.width; tempCanvas.height = coverImage.height;
    tCtx.drawImage(coverImage, 0, 0);
    const pixels = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    const colors = {};
    for (let i = 0; i < pixels.length; i += 40) {
        const rgb = `${pixels[i]},${pixels[i+1]},${pixels[i+2]}`;
        colors[rgb] = (colors[rgb] || 0) + 1;
    }
    const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]);
    const rgbToHex = (rgbStr) => {
        const [r, g, b] = rgbStr.split(',').map(Number);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };
    document.getElementById('color1').value = rgbToHex(sorted[0][0]);
    document.getElementById('color2').value = sorted.length > 1 ? rgbToHex(sorted[1][0]) : rgbToHex(sorted[0][0]);
    const [r, g, b] = sorted[0][0].split(',').map(Number);
    document.getElementById('textColor').value = (r*299 + g*587 + b*114)/1000 > 128 ? "#000000" : "#ffffff";
    draw();
}

function draw() {
    document.fonts.ready.then(() => {
        const text = document.getElementById('textInput').value;
        const c1 = document.getElementById('color1').value;
        const c2 = document.getElementById('color2').value;
        const textColor = document.getElementById('textColor').value;
        const fontSize = parseInt(document.getElementById('fontSizeRange').value);
        const fontStyle = document.getElementById('fontSelect').value;
        const bookTitle = document.getElementById('bookTitleInput').value;
        const bookAuthor = document.getElementById('bookAuthorInput').value;
        const yPosRatio = parseFloat(document.getElementById('textYPos').value);
        const lineFactor = parseFloat(document.getElementById('lineHeightRange').value);

        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, c1); grad.addColorStop(1, c2);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = textColor;
        ctx.font = `${fontSize}px ${fontStyle}`;
        const maxWidth = 850;
        const xStart = (canvas.width - maxWidth) / 2;
        
        const paragraphs = text.split('\n');
        let allLines = [];
        
        paragraphs.forEach(p => {
            const trimmedP = p.replace(/\s+/g, ' ').trim();
            if (trimmedP === "") { allLines.push({ chars: [], isLast: true }); return; }
            
            let currentLineChars = [];
            for (let i = 0; i < trimmedP.length; i++) {
                let char = trimmedP[i];
                if (currentLineChars.length === 0 && char === ' ') continue;
                let testLine = currentLineChars.join('') + char;
                if (ctx.measureText(testLine).width <= maxWidth) {
                    currentLineChars.push(char);
                } else {
                    while(currentLineChars[currentLineChars.length-1] === ' ') currentLineChars.pop();
                    allLines.push({ chars: currentLineChars, isLast: false });
                    currentLineChars = [char];
                }
            }
            allLines.push({ chars: currentLineChars, isLast: true });
        });

        const lineHeight = fontSize * lineFactor;
        const totalH = allLines.length * lineHeight;
        let currentY = (canvas.height * yPosRatio) - (totalH / 2) + fontSize;

        ctx.textAlign = 'left';
        allLines.forEach(lineObj => {
            const chars = lineObj.chars;
            if (chars.length === 0) { currentY += lineHeight; return; }
            if (lineObj.isLast || chars.length <= 1) {
                ctx.fillText(chars.join(''), xStart, currentY);
            } else {
                const totalCharsWidth = chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0);
                const gap = (maxWidth - totalCharsWidth) / (chars.length - 1);
                let xCursor = xStart;
                chars.forEach((char) => {
                    ctx.fillText(char, xCursor, currentY);
                    xCursor += ctx.measureText(char).width + gap;
                });
            }
            currentY += lineHeight;
        });

        const baseMargin = 115; 
        const coverW = 260;
        if (coverImage.src && coverImage.complete) {
            const coverH = (coverImage.height / coverImage.width) * coverW;
            const coverX = canvas.width - coverW - 100;
            const coverY = canvas.height - coverH - baseMargin;
            ctx.shadowBlur = 30; ctx.shadowColor = "rgba(0,0,0,0.3)";
            ctx.drawImage(coverImage, coverX, coverY, coverW, coverH);
            ctx.shadowBlur = 0;
            drawBookInfo(coverX - 40, canvas.height - baseMargin);
        } else { drawBookInfo(canvas.width - 100, canvas.height - baseMargin); }

        function drawBookInfo(x, y) {
            ctx.textAlign = 'right'; ctx.fillStyle = textColor;
            const titleFontSize = 40; const authorFontSize = 30;
            const titleLineHeight = titleFontSize * 1.2;
            const titleLines = bookTitle.split('\n');
            if (bookAuthor) {
                ctx.font = `${authorFontSize}px 'Apple SD Gothic Neo'`;
                ctx.globalAlpha = 0.8; ctx.fillText(bookAuthor, x, y - 15); ctx.globalAlpha = 1.0;
            }
            ctx.font = `bold ${titleFontSize}px 'Apple SD Gothic Neo'`;
            let titleY = bookAuthor ? y - 15 - 50 : y - 15;
            for(let i = titleLines.length - 1; i >= 0; i--) {
                ctx.fillText(titleLines[i], x, titleY);
                titleY -= titleLineHeight;
            }
        }
    });
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = `문장아카이브_${new Date().getTime()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}
window.onload = () => setTimeout(draw, 500);
