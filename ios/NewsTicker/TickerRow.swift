import SwiftUI

struct TickerRow: View {
    @Environment(AppModel.self) private var model
    let item: TickerItem
    let isLast: Bool
    @State private var open = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Zeitleiste: Punkt + Linie
            VStack(spacing: 0) {
                Circle().fill(Color.accentColor).frame(width: 10, height: 10).padding(.top, 5)
                Rectangle().fill(Color(.separator)).frame(width: 2).opacity(isLast ? 0 : 1)
            }.frame(width: 10)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    if let d = item.date {
                        Text(TimeFormat.label(d)).font(.footnote.weight(.semibold)).monospacedDigit().foregroundStyle(Color.accentColor)
                    }
                    if item.isTop {
                        Text("TOP").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 4)).foregroundStyle(.white)
                    }
                    Spacer()
                    Text(item.sourceName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Text(item.title).font(.headline)
                if !item.teaser.isEmpty { Text(item.teaser).font(.subheadline) }

                HStack {
                    Button {
                        withAnimation(.easeInOut(duration: 0.25)) { open.toggle() }
                        if open { Task { await model.loadDetail(item.id) } }
                    } label: {
                        HStack(spacing: 4) {
                            Text("Mehr")
                            Image(systemName: "chevron.down").rotationEffect(.degrees(open ? 180 : 0))
                        }.frame(minHeight: 44)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityValue(open ? "geöffnet" : "geschlossen")
                    Spacer()
                    if let url = URL(string: item.url) {
                        ShareLink(item: url, subject: Text(item.title), message: Text(item.title)) {
                            Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                        }.buttonStyle(.borderless).accessibilityLabel("Teilen")
                    }
                }

                if open { detail.transition(.opacity.combined(with: .move(edge: .top))) }
            }
            .padding(.bottom, 12)
        }
    }

    @ViewBuilder private var detail: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch model.details[item.id] {
            case .loaded(let d):
                Text(d.summary).font(.subheadline)
                if d.limited { Text("Nur Kurzfassung verfügbar.").font(.footnote).foregroundStyle(.secondary) }
            case .failed(let msg):
                Text(msg).font(.footnote).foregroundStyle(.red)
                Button("Erneut versuchen") { Task { await model.loadDetail(item.id) } }
            default:
                VStack(alignment: .leading, spacing: 8) {
                    ForEach([1.0, 1.0, 0.6], id: \.self) { w in
                        RoundedRectangle(cornerRadius: 4).fill(Color(.tertiarySystemFill)).frame(height: 14).containerRelativeFrame(.horizontal) { l, _ in l * 0.7 * w }
                    }
                }.accessibilityLabel("Lädt")
            }
            if let url = URL(string: item.url) {
                Link(destination: url) { Label("Zur Quelle", systemImage: "arrow.up.right.square").fontWeight(.semibold).frame(minHeight: 44) }
            }
        }
    }
}
