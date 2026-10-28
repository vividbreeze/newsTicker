import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appearance") private var appearance = AppearanceChoice.system.rawValue

    @State private var draft: Settings?
    @State private var url = ""
    @State private var token = ""
    @State private var testResult: (ok: Bool, text: String)?
    @State private var saveError: String?
    @State private var expanded: Set<String> = []

    var body: some View {
        NavigationStack {
            Form {
                serverSection
                if draft != nil {
                    countriesSection
                    countSection
                    sourcesSection
                }
                Section {
                    Picker("Darstellung", selection: $appearance) {
                        ForEach(AppearanceChoice.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                }
                if let saveError { Section { Text(saveError).foregroundStyle(.red) } }
                Section { Text("Die Einstellungen werden auf dem Server gespeichert und gelten für alle Geräte.").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("Einstellungen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .environment(\.editMode, .constant(.active)) // Ziehgriffe zum Umsortieren
            .onAppear { draft = model.settings; url = model.connection.url; token = model.connection.token }
            .task { await model.loadSources() }
        }
    }

    // MARK: Abschnitte

    private var serverSection: some View {
        Section {
            TextField("URL", text: $url).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
            SecureField("Token", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Verbindung testen") {
                Task {
                    let c = Connection(url: url, token: token.trimmingCharacters(in: .whitespacesAndNewlines))
                    if let err = await model.testConnection(c) { testResult = (false, err) }
                    else { testResult = (true, "Verbindung erfolgreich"); try? await model.connect(c); draft = model.settings }
                }
            }
        } header: { Text("Server") } footer: {
            if let t = testResult { Text(t.text).foregroundStyle(t.ok ? .green : .red) }
        }
    }

    private var countriesSection: some View {
        Section {
            ForEach(draft?.activeCountries ?? [], id: \.self) { code in
                HStack(spacing: 10) {
                    Image(systemName: "checkmark").foregroundStyle(.tint)
                    FlagView(code: code); Text(countryName(code))
                }
            }
            .onMove { from, to in
                draft?.activeCountries.move(fromOffsets: from, toOffset: to); commit()
            }
            ForEach(inactiveCountries, id: \.self) { code in
                Button {
                    // Ein inaktives Land ersetzt das dritte.
                    draft?.activeCountries[2] = code; commit()
                } label: {
                    HStack(spacing: 10) { Image(systemName: "checkmark").hidden(); FlagView(code: code); Text(countryName(code)).foregroundStyle(.primary); Spacer(); Text("ersetzt Platz 3").font(.footnote).foregroundStyle(.secondary) }
                }
            }.moveDisabled(true)
        } header: { Text("Länder (genau 3, Reihenfolge ziehbar)") }
    }

    private var countSection: some View {
        Section("Anzeige") {
            Stepper(value: Binding(get: { draft?.itemCount ?? 12 }, set: { draft?.itemCount = $0; commit(debounce: true) }), in: 5...30) {
                Text("\(draft?.itemCount ?? 12) Meldungen")
            }
            Picker("Zusammenfassung", selection: Binding(get: { draft?.summaryLength ?? .medium }, set: { draft?.summaryLength = $0; commit() })) {
                ForEach(SummaryLength.allCases) { Text($0.label).tag($0) }
            }
        }
    }

    private var sourcesSection: some View {
        Section("Quellen") {
            ForEach((draft?.activeCountries ?? []) + inactiveCountries, id: \.self) { code in
                DisclosureGroup(isExpanded: Binding(get: { expanded.contains(code) }, set: { if $0 { expanded.insert(code) } else { expanded.remove(code) } })) {
                    ForEach(draft?.sources[code] ?? [], id: \.id) { src in
                        let info = model.sources.first { $0.id == src.id }
                        HStack(spacing: 10) {
                            Circle().fill(color(info?.status)).frame(width: 10, height: 10).accessibilityLabel("Status \(info?.status ?? "unbekannt")")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(info?.name ?? src.id)
                                Text(detailText(info)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(get: { src.enabled }, set: { setSource(code, src.id, $0) })).labelsHidden()
                        }
                    }
                    .onMove { from, to in draft?.sources[code]?.move(fromOffsets: from, toOffset: to); commit() }
                } label: { HStack(spacing: 10) { FlagView(code: code); Text(countryName(code)) } }
            }
        }
    }

    // MARK: Hilfen

    private var inactiveCountries: [String] {
        (model.meta?.countries.map(\.code) ?? []).filter { !(draft?.activeCountries.contains($0) ?? false) }
    }
    private func countryName(_ code: String) -> String {
        model.meta?.countries.first(where: { $0.code == code })?.name ?? code
    }
    private func color(_ status: String?) -> Color {
        switch status { case "ok": .green; case "warn": .yellow; case "error": .red; default: .gray }
    }
    private func detailText(_ i: SourceInfo?) -> String {
        guard let i else { return "" }
        let cats = i.categories.compactMap { k in model.meta?.categories.first { $0.key == k }?.label }.joined(separator: ", ")
        return i.message.map { "\(cats) · \($0)" } ?? cats
    }
    private func setSource(_ code: String, _ id: String, _ on: Bool) {
        guard let i = draft?.sources[code]?.firstIndex(where: { $0.id == id }) else { return }
        draft?.sources[code]?[i].enabled = on
        commit()
    }

    @State private var pending: Task<Void, Never>?
    private func commit(debounce: Bool = false) {
        guard let s = draft else { return }
        pending?.cancel()
        pending = Task {
            if debounce { try? await Task.sleep(for: .milliseconds(600)) }
            guard !Task.isCancelled else { return }
            saveError = await model.save(s)
            if saveError != nil { draft = model.settings }
        }
    }
}
