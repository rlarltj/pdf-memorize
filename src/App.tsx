import { useState } from 'react';
import { HomeView } from './views/HomeView';
import { StudyView } from './views/StudyView';
import './App.css';

type View = { name: 'home' } | { name: 'study'; documentId?: string } | { name: 'document'; documentId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const home = () => setView({ name: 'home' });

  switch (view.name) {
    case 'study':
      return <StudyView documentId={view.documentId} onExit={home} />;
    default:
      return (
        <HomeView
          onStudy={(documentId) => setView({ name: 'study', documentId })}
          onOpenDocument={(documentId) => setView({ name: 'document', documentId })}
        />
      );
  }
}
