#include <algorithm>
#include <iostream>
#include <limits>
#include <queue>
#include <tuple>
#include <utility>
#include <vector>

using namespace std;

struct Edge {
    int to;
    int weight;
};

int main() {
    constexpr int n = 6;
    constexpr int start = 0;
    constexpr int INF = numeric_limits<int>::max();

    // 無向邊：{u, v, w}
    const vector<tuple<int, int, int>> edges = {
        {0, 1, 2}, {0, 2, 5}, {1, 2, 1}, {1, 3, 4},
        {2, 4, 2}, {4, 3, 1}, {3, 5, 3}, {4, 5, 6}
    };

    vector<vector<Edge>> graph(n);
    for (auto [u, v, weight] : edges) {
        graph[u].push_back({v, weight});
        graph[v].push_back({u, weight});
    }

    // min-priority queue: (目前距離, 節點)
    using State = pair<int, int>;
    priority_queue<State, vector<State>, greater<State>> pq;
    vector<int> dist(n, INF);
    vector<int> parent(n, -1);
    vector<bool> visited(n, false);

    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        auto [distance, u] = pq.top();
        pq.pop();

        // 舊的候選距離已過期，或節點已確定最短距離。
        if (distance != dist[u] || visited[u]) continue;
        visited[u] = true;

        for (const Edge& edge : graph[u]) {
            const int v = edge.to;
            const int candidate = dist[u] + edge.weight;
            if (!visited[v] && candidate < dist[v]) {
                dist[v] = candidate;
                parent[v] = u;
                pq.push({candidate, v});
            }
        }
    }

    cout << "Dijkstra (source = " << start << ")\n";
    for (int v = 0; v < n; ++v) {
        cout << "節點 " << v << ": ";
        if (dist[v] == INF) {
            cout << "無法到達\n";
            continue;
        }

        cout << "距離 = " << dist[v] << ", 路徑 = ";
        vector<int> path;
        for (int cur = v; cur != -1; cur = parent[cur]) path.push_back(cur);
        reverse(path.begin(), path.end());
        for (size_t i = 0; i < path.size(); ++i) {
            if (i) cout << " -> ";
            cout << path[i];
        }
        cout << '\n';
    }
}
