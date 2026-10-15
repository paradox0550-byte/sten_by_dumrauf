import { createElement, type ReactNode } from 'react';

function inline(text: string, prefix: string): ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*|\x60[^\x60]+\x60|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.filter(Boolean).map((part, index) => {
    const key = prefix + '-' + index;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.charCodeAt(0) === 96 && part.endsWith(String.fromCharCode(96))) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}
function isTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|');
  return cells.length > 1 && cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell));
}
function cells(line: string): string[] { return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()); }
function startsBlock(line: string): boolean { return /^(#{1,6})\s+/.test(line) || /^\s*\x60{3}/.test(line) || /^\s*>\s?/.test(line) || /^\s*(?:[-*+] |\d+\. )/.test(line); }

export default function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: Array<{type:'paragraph'|'heading'|'list'|'code'|'table'|'quote';lines:string[];level?:number;ordered?:boolean;language?:string}> = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*\x60{3}\s*([\w-]*)/);
    if (fence) {
      const code: string[] = []; i++;
      while (i < lines.length && !/^\s*\x60{3}/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({type:'code',lines:code,language:fence[1]}); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { blocks.push({type:'heading',lines:[heading[2]],level:heading[1].length}); i++; continue; }
    if (i+1 < lines.length && line.includes('|') && isTableSeparator(lines[i+1])) {
      const tableLines=[line]; i+=2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) tableLines.push(lines[i++]);
      blocks.push({type:'table',lines:tableLines}); continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote:string[]=[];
      while(i<lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/,''));
      blocks.push({type:'quote',lines:quote}); continue;
    }
    const listMatch=line.match(/^\s*([-*+] |\d+\. )(.*)$/);
    if(listMatch){
      const ordered=/^\s*\d+\. /.test(line),items:string[]=[];
      while(i<lines.length){
        const match=lines[i].match(/^\s*([-*+] |\d+\. )(.*)$/);
        if(!match || /^\s*\d+\. /.test(lines[i])!==ordered)break;
        items.push(match[2]);i++;
      }
      blocks.push({type:'list',lines:items,ordered});continue;
    }
    const paragraph=[line];i++;
    while(i<lines.length && lines[i].trim() && !startsBlock(lines[i]) && !(i+1<lines.length && lines[i].includes('|') && isTableSeparator(lines[i+1])))paragraph.push(lines[i++]);
    blocks.push({type:'paragraph',lines:paragraph});
  }
  return <div className="sten-markdown">{blocks.map((block,index)=>{
    const key='block-'+index;
    if(block.type==='code')return <pre key={key}><code className={block.language?'language-'+block.language:undefined}>{block.lines.join('\n')}</code></pre>;
    if(block.type==='heading') return createElement('h'+block.level, {key}, ...inline(block.lines[0],key));
    if(block.type==='list'){const Tag=block.ordered?'ol':'ul';return <Tag key={key}>{block.lines.map((item,n)=><li key={key+'-'+n}>{inline(item,key+'-'+n)}</li>)}</Tag>;}
    if(block.type==='quote')return <blockquote key={key}>{block.lines.map((line,n)=><p key={key+'-'+n}>{inline(line,key+'-'+n)}</p>)}</blockquote>;
    if(block.type==='table'){const rows=block.lines.map(cells);return <div className="sten-markdown__table-wrap" key={key}><table><thead><tr>{rows[0].map((cell,n)=><th key={n}>{inline(cell,key+'-h-'+n)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,r)=><tr key={key+'-r-'+r}>{row.map((cell,n)=><td key={n}>{inline(cell,key+'-'+r+'-'+n)}</td>)}</tr>)}</tbody></table></div>;}
    return <p key={key}>{inline(block.lines.join(' '),key)}</p>;
  })}</div>;
}
