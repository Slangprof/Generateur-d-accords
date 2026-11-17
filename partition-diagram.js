/* Measurements in PDF points. SVG and PDF consume the same drawing. */
(() => {
  const stringGap = 3.63;
  const fretGap = 4.057;
  
  const glyphs = window.BOOGALOO_GLYPHS;
  const number = value => Number(value.toFixed(4));
  const glyphText = label => label.replaceAll('♭', 'b').replaceAll('♯', '#');
  const textWidth = (label, size) => [...label].reduce((width, char) => {
    if (!glyphs[char]) throw new Error('Caractère non pris en charge : ' + char);
    return width + glyphs[char][0] * size;
  }, 0);
  function text(label, x, y, size) {
    const path = [];
    for (const char of label) {
      const [advance, commands] = glyphs[char];
      path.push(...commands.map(([op, ...coords]) =>
        [op, ...coords.map((value, i) => value * size + (i % 2 ? y : x))]));
      x += advance * size;
    }
    return { path, fill: 0 };
  }
  function capsule(x, y, width, radius, fill, stroke) {
    const k = 0.55228475 * radius;
    return { fill, stroke, path: [
      ['M', x, y-radius], ['L', x+width, y-radius],
      ['C', x+width+k,y-radius,x+width+radius,y-k,x+width+radius,y],
      ['C', x+width+radius,y+k,x+width+k,y+radius,x+width,y+radius],
      ['L', x,y+radius],
      ['C', x-k,y+radius,x-radius,y+k,x-radius,y],
      ['C', x-radius,y-k,x-k,y-radius,x,y-radius], ['Z']
    ] };
  }
  function fits(position) {
    const pressed = position.frets.filter(fret => fret > 0);
    return !pressed.length || Math.max(...pressed) - Math.min(...pressed) <= 2;
  }
  function create(label, position, notes = []) {
    if (!fits(position)) throw new Error('Le doigté dépasse trois cases.');
    const name = glyphText(label);
    const absolute = position.frets.map(fret => fret > 0 ? fret + (position.baseFret || 1) - 1 : fret);
    const played = absolute.filter(fret => fret > 0);
    const highest = Math.max(0, ...played);
    const start = highest > 3 ? Math.min(...played) : 1;
    const rows = 3;
    const headroom = absolute.includes(-1) ? 3 : 0;
    const gridTop = 2.2 + headroom;
    const gridHeight = 15.5816 + headroom;
    const height = gridHeight + (notes.length ? 5 : name.includes('j') ? 2 : 0);
    const marker = start > 1 ? String(start) : '';
    const left = textWidth(name, 13) + Math.max(2.6, textWidth(marker, 4.2) + 1);
    const right = left + (absolute.length - 1) * stringGap;
    const bottom = gridTop + rows * fretGap;
    const shapes = [text(name, .48, gridHeight - 1.6, 13)];
    const line = (x1, y1, x2, y2) => shapes.push({path: [['M',x1,y1],['L',x2,y2]], stroke: .22});
    absolute.forEach((_, i) => line(left+i*stringGap,gridTop,left+i*stringGap,bottom));
    for (let row = 0; row <= rows; row++) line(left,gridTop+row*fretGap,right,gridTop+row*fretGap);
    shapes.push(capsule(left+.34,gridTop-.555,right-left-.68,.535,.33,.22));
    if (marker) shapes.push(text(marker,left-.56-textWidth(marker,4.2),gridTop+2.15,4.2));
    const covered = new Set();
    for (const barre of position.barres || []) {
      const strings = position.frets.flatMap((fret, i) => fret === barre ? [i] : []);
      if (strings.length < 2) continue;
      strings.forEach(i => covered.add(i));
      const first = strings[0];
      const last = strings.at(-1);
      const y = gridTop + (absolute[first]-start+.5)*fretGap;
      shapes.push(capsule(left+first*stringGap,y,(last-first)*stringGap,1.31,0));
    }
    absolute.forEach((fret,i) => {
      const x = left+i*stringGap;
      if (fret < 0) shapes.push(text('X',x-1.3,gridTop-.9,4));
      if (fret > 0 && !covered.has(i)) shapes.push(capsule(x,gridTop+(fret-start+.5)*fretGap,0,1.31,0));
    });
    notes.forEach((note, i) => {
      const value = glyphText(note);
      const x = left + i * stringGap - textWidth(value, 3.2) / 2;
      shapes.push(text(value, x, bottom + 4.4, 3.2));
    });
    return { width: right+2.41, height, shapes, label };
  }
  function svg({width,height,shapes,label}) {
    const accessible = label.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    const paths = shapes.map(({path,fill,stroke}) => {
      const d = path.map(([op,...coords]) => op + coords.map(number).join(' ')).join(' ');
      return `<path d="${d}" fill="${fill === undefined ? 'none' : 'rgb('+[fill,fill,fill].map(v=>Math.round(v*255)).join(',')+')'}"${stroke ? ` stroke="black" stroke-width="${stroke}"` : ''}/>`;
    }).join('');
    return `<svg class="diagram partition-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Diagramme de ${accessible}">${paths}</svg>`;
  }
  function pdf(drawings) {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
    const pages = [];
    for (const {width,height,shapes} of drawings) {
      const stream = shapes.map(({path,fill,stroke}) => {
        const geometry = path.map(([op,...coords]) => {
          const command = {M:'m',L:'l',C:'c',Z:'h'}[op];
          return [...coords.map((v,i)=>number(i%2 ? height-v : v)),command].join(' ');
        }).join('\n');
        return `${fill ?? 0} g ${stroke || .22} w 0 G\n${geometry}\n${stroke ? (fill === undefined ? 'S' : 'B') : 'f'}`;
      }).join('\n')+'\n';
      const page = objects.length+1;
      pages.push(page+' 0 R');
      objects.push(`<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 ${number(width)} ${number(height)}] /Contents ${page+1} 0 R >>`);
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    }
    objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.join(' ')}] >>`;
    let result='%PDF-1.4\n';
    const offsets=objects.map((object,i)=>{
      const offset=result.length;
      result+=`${i+1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref=result.length;
    result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    for (const offset of offsets) result+=String(offset).padStart(10,'0')+' 00000 n \n';
    return result+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  }
  window.PartitionDiagram = {create, svg, pdf, fits};
})();
