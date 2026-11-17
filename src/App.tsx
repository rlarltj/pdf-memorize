import { useState } from 'react';
import { HomeView } from './views/HomeView';
import { StudyView } from './views/StudyView';
import { DocumentView } from './views/DocumentView';
import { useSync } from './hooks/useSync';
import './App.css';

type View = { name: 'home' } | { name: 'study'; documentId?: string } | { name: 'document'; documentId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const sync = useSync();
  const home = () => {
    setView({ name: 'home' });
    void sync.syncNow();
  };

  switch (view.name) {
    case 'study':
      return <StudyView documentId={view.documentId} onExit={home} />;
    case 'document':
      return <DocumentView documentId={view.documentId} onBack={home} onStudy={(documentId) => setView({ name: 'study', documentId })} />;
    default:
      return (
        <HomeView
          sync={sync}
          onStudy={(documentId) => setView({ name: 'study', documentId })}
          onOpenDocument={(documentId) => setView({ name: 'document', documentId })}
        />
      );
  }
}
