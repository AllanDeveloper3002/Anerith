export default function AppLoading() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-8 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-44 lg:col-span-2" />
        <div className="skeleton h-44" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-28" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}
