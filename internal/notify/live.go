package notify

import "sync"

// Live is everyone with Bangkee open right now: one channel per open tab,
// by user. A notification written for someone is also handed to each of
// their tabs, so the bell and the balance change while they watch.
//
// It lives in this process's memory, which is right for one server. A tab
// that is not connected misses nothing: the notification is in the database
// and the app refreshes when it reconnects.
type Live struct {
	mu   sync.Mutex
	tabs map[int64]map[chan []byte]struct{}
}

func newLive() *Live { return &Live{tabs: map[int64]map[chan []byte]struct{}{}} }

// Subscribe opens a tab for a user. Call the returned func when the tab goes.
func (l *Live) Subscribe(userID int64) (<-chan []byte, func()) {
	// A few messages of slack; a tab that cannot keep up drops them rather
	// than holding up the request that wrote the notification.
	ch := make(chan []byte, 8)
	l.mu.Lock()
	if l.tabs[userID] == nil {
		l.tabs[userID] = map[chan []byte]struct{}{}
	}
	l.tabs[userID][ch] = struct{}{}
	l.mu.Unlock()
	return ch, func() {
		l.mu.Lock()
		delete(l.tabs[userID], ch)
		if len(l.tabs[userID]) == 0 {
			delete(l.tabs, userID)
		}
		l.mu.Unlock()
	}
}

func (l *Live) publish(userID int64, message []byte) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for ch := range l.tabs[userID] {
		select {
		case ch <- message:
		default:
		}
	}
}
