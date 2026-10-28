import SwiftUI

struct TickerView: View {
    @Environment(AppModel.self) private var model
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                list
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showSettings) { SettingsView() }
        }
    }

    // MARK: Kopf

    private var header: some View {
        VStack(spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nachrichten-Ticker").font(.system(size: 28, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                    if let d = model.ticker?.fetchedDate {
                        (Text("Stand: \(TimeFormat.clock(d))") + Text(model.ticker?.stale == true ? " · veraltet" : "").foregroundColor(.orange))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button { Task { await model.loadTicker(refresh: true) } } label: {
                    Image(systemName: "arrow.clockwise").symbolEffect(.pulse, isActive: model.isLoading)
                        .frame(width: 44, height: 44)
                }.accessibilityLabel("Aktualisieren")
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape").frame(width: 44, height: 44)
                }.accessibilityLabel("Einstellungen")
            }
            countryPicker
            categoryChips
        }
        .padding(.horizontal).padding(.bottom, 8)
        .background(.bar)
    }

    /// Eigenes Segmented Control: der System-Picker stellt Flaggen-Emojis nicht zuverlässig dar.
    private var countryPicker: some View {
        HStack(spacing: 2) {
            ForEach(model.settings?.activeCountries ?? [], id: \.self) { code in
                if let c = model.meta?.countries.first(where: { $0.code == code }) {
                    let on = code == model.country
                    Button { model.country = code } label: {
                        Text("\(c.flag) \(c.short)").font(.subheadline.weight(on ? .semibold : .medium))
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(on ? Color(.systemBackground) : .clear, in: RoundedRectangle(cornerRadius: 8))
                            .shadow(color: on ? .black.opacity(0.12) : .clear, radius: 2, y: 1)
                            .foregroundStyle(.primary)
                    }
                    .accessibilityLabel(c.name).accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        .padding(2).background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
        .animation(.easeInOut(duration: 0.15), value: model.country)
    }

    private var categoryChips: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.meta?.categories ?? []) { c in
                        let on = c.key == model.category
                        Button { model.category = c.key } label: {
                            Label(c.label, systemImage: CategoryIcons.symbol(for: c.icon))
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 14).frame(minHeight: 44)
                                .background(on ? Color.accentColor : Color(.tertiarySystemFill), in: Capsule())
                                .foregroundStyle(on ? Color.white : Color.primary)
                        }
                        .id(c.key)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }.padding(.horizontal, 1)
            }
            .onChange(of: model.category) { _, new in withAnimation { proxy.scrollTo(new, anchor: .center) } }
        }
    }

    // MARK: Liste

    private var list: some View {
        List {
            if let t = model.ticker {
                if let n = t.notice { Banner(text: n) }
                if t.stale { Banner(text: "Quellen nicht erreichbar – letzter bekannter Stand.") }
                else if !t.sourceErrors.isEmpty { Banner(text: "Ausgefallen: " + t.sourceErrors.map(\.sourceId).joined(separator: ", ")) }
                ForEach(t.items) { item in
                    TickerRow(item: item, isLast: item.id == t.items.last?.id)
                        .listRowSeparator(.hidden).listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                }
                if t.items.isEmpty { ContentUnavailableView("Keine Meldungen", systemImage: "newspaper", description: Text("Für diese Auswahl gibt es nichts Aktuelles.")) }
            } else if let err = model.tickerError {
                ContentUnavailableView {
                    Label("Fehler", systemImage: "exclamationmark.triangle")
                } description: { Text(err) } actions: {
                    Button("Erneut versuchen") { Task { await model.loadTicker(refresh: true) } }.buttonStyle(.borderedProminent)
                }.listRowSeparator(.hidden)
            } else {
                ForEach(0..<5, id: \.self) { _ in SkeletonRow().listRowSeparator(.hidden) }
            }
        }
        .listStyle(.plain)
        .refreshable { await model.loadTicker(refresh: true) }
        .task(id: model.selectionKey) { await model.loadTicker(refresh: false) }
        .simultaneousGesture(
            DragGesture(minimumDistance: 40).onEnded { v in
                guard abs(v.translation.width) > 80, abs(v.translation.height) < 50 else { return }
                withAnimation { model.stepCategory(v.translation.width < 0 ? 1 : -1) }
            }
        )
    }
}

struct Banner: View {
    let text: String
    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle")
            .font(.footnote)
            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.yellow.opacity(0.2), in: RoundedRectangle(cornerRadius: 10))
            .listRowSeparator(.hidden)
    }
}

struct SkeletonRow: View {
    @State private var on = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 4).frame(width: 80, height: 12)
            RoundedRectangle(cornerRadius: 4).frame(height: 16)
            RoundedRectangle(cornerRadius: 4).frame(width: 220, height: 14)
        }
        .foregroundStyle(Color(.tertiarySystemFill)).opacity(on ? 0.5 : 1)
        .padding(.vertical, 8)
        .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever()) { on = true } }
        .accessibilityLabel("Lädt")
    }
}
