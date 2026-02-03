import { MusicTools } from '../components/MusicTools';

export default function Tools() {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>Muziek Tools</h1>
      </div>

      <p className="text-light" style={{ marginBottom: '1.5rem' }}>
        Handige hulpmiddelen voor het oefenen en stemmen van je instrument.
      </p>

      <MusicTools />
    </div>
  );
}
