import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// 하이라이트 문장용 명조. 글자 범위별로 쪼개져 화면에 쓰인 범위만 내려받는다 (predev/prebuild가 생성)
import './styles/serif.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
