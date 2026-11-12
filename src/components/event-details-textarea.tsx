'use client';
import {useLayoutEffect,useRef,type TextareaHTMLAttributes} from 'react';

// Resize after typing, loading a saved event, revealing its tab, or changing width.
export function EventDetailsTextarea({className='',rows=2,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>){
  const ref=useRef<HTMLTextAreaElement>(null);
  function fit(){const field=ref.current;if(!field?.clientWidth)return;field.style.height='auto';field.style.height=`${field.scrollHeight+2}px`;}
  useLayoutEffect(fit,[props.value]);
  useLayoutEffect(()=>{const field=ref.current;if(!field)return;let width=-1;const observer=new ResizeObserver(()=>{if(field.clientWidth!==width){width=field.clientWidth;fit();}});observer.observe(field);return()=>observer.disconnect();},[]);
  return <textarea {...props} ref={ref} rows={rows} className={'event-details-textarea '+className}/>;
}
