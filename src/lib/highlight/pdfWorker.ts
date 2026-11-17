import { GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// 브라우저 전용. 테스트(Node)에서는 import하지 않는다.
GlobalWorkerOptions.workerSrc = workerUrl;
