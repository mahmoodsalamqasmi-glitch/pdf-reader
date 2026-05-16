import { loadJson, saveJson } from "./storage.js";

function annotationKey(docId) {
  return `annotations:${docId}`;
}

export function loadAnnotations(docId) {
  return loadJson(annotationKey(docId), {
    bookmarks: [],
    notes: [],
    marks: [],
    ink: []
  });
}

export function saveAnnotations(docId, annotations) {
  saveJson(annotationKey(docId), annotations);
}

export function addBookmark(annotations, pageNumber) {
  if (!annotations.bookmarks.includes(pageNumber)) {
    annotations.bookmarks.push(pageNumber);
    annotations.bookmarks.sort((a, b) => a - b);
  }
}

export function removeBookmark(annotations, pageNumber) {
  annotations.bookmarks = annotations.bookmarks.filter((page) => page !== pageNumber);
}

export function addNote(annotations, pageNumber, text) {
  annotations.notes.unshift({
    id: crypto.randomUUID(),
    pageNumber,
    text,
    createdAt: Date.now()
  });
}

export function addMark(annotations, mark) {
  annotations.marks.push({
    id: crypto.randomUUID(),
    ...mark
  });
}

export function addInkStroke(annotations, stroke) {
  annotations.ink.push({
    id: crypto.randomUUID(),
    ...stroke
  });
}
