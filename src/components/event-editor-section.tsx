"use client";

import type {ReactNode} from "react";

export function revealEventEditorField(field:HTMLElement|null){
  if(!field)return;
  let parent=field.parentElement;
  while(parent){
    if(parent instanceof HTMLDetailsElement)parent.open=true;
    parent=parent.parentElement;
  }
  field.focus({preventScroll:true});
  field.scrollIntoView({behavior:"smooth",block:"center"});
}

export function EventEditorSection({title,summary,children,className=""}:{title:string;summary?:ReactNode;children:ReactNode;className?:string}){
  return <details className={"event-editor-section "+className}>
    <summary><span className="event-section-arrow" aria-hidden="true"/><strong className="event-section-name">{title}</strong>{summary?<span className="event-section-summary">{summary}</span>:null}</summary>
    <div className="event-section-body">{children}</div>
  </details>;
}
