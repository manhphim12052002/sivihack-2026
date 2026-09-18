import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {PDFParse} from 'pdf-parse';
it('Brenner PDF parser preserves money, negative qualification and ambiguous March',async()=>{
 const data=await readFile(new URL('../../../../test-fixtures/brenner.pdf',import.meta.url));
 const parser=new PDFParse({data:new Uint8Array(data)});
 try{const r=await parser.getText();expect(r.text).toContain('€2.9M');expect(r.text).toContain('no DB qualification');expect(r.text).toContain('March');expect(r.text).not.toContain('2023-03-01');}finally{await parser.destroy();}
});
