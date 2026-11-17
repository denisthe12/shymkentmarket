package middleware

import (
	"context"
	"errors"
	"net/http"
	"sync/atomic"
)

type outcomeKey struct{}
type requestOutcome struct{ code atomic.Uint32 }

const (
	outcomeNone uint32 = iota
	outcomeCanceled
	outcomeDeadline
)

func withOutcome(r *http.Request) (*http.Request, *requestOutcome) {
	if state, ok := r.Context().Value(outcomeKey{}).(*requestOutcome); ok {
		return r, state
	}
	state := &requestOutcome{}
	return r.WithContext(context.WithValue(r.Context(), outcomeKey{}, state)), state
}

// A joined independent error must not be hidden merely because one branch is canceled.
func onlyContextError(err, target error) bool {
	if err == nil || !errors.Is(err, target) {
		return false
	}
	if many, ok := err.(interface{ Unwrap() []error }); ok {
		children := many.Unwrap()
		if len(children) == 0 {
			return false
		}
		for _, child := range children {
			if !onlyContextError(child, target) {
				return false
			}
		}
	} else if one, ok := err.(interface{ Unwrap() error }); ok {
		return onlyContextError(one.Unwrap(), target)
	}
	return true
}

// HandleRequestError handles only a corroborated cancellation or a dependency deadline.
// It never classifies an unrelated DB failure using ctx.Err() alone.
func HandleRequestError(w http.ResponseWriter, r *http.Request, err error) bool {
	canceled := errors.Is(r.Context().Err(), context.Canceled) && onlyContextError(err, context.Canceled)
	deadline := onlyContextError(err, context.DeadlineExceeded)
	if !canceled && !deadline {
		return false
	}
	// Preserve headers already sent; never rewrite a committed response.
	if written, ok := w.(interface{ Status() int }); ok && written.Status() != 0 {
		return true
	}
	state, _ := r.Context().Value(outcomeKey{}).(*requestOutcome)
	if canceled {
		if state != nil {
			state.code.Store(outcomeCanceled)
		}
		return true
	}
	if state != nil {
		state.code.Store(outcomeDeadline)
	}
	WriteError(w, http.StatusServiceUnavailable)
	return true
}
